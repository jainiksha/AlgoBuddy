require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const Redis = require("ioredis");
const { createAdapter } = require("@socket.io/redis-adapter");

const app = express();
app.use(cors());

const server = http.createServer(app);

// Redis setup
const redisUrl = process.env.REDIS_URL; // Required for Render
const pubClient = redisUrl ? new Redis(redisUrl) : new Redis();
const subClient = pubClient.duplicate();
const redisClient = pubClient.duplicate(); // For state storage

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://algobuddy.vercel.app",
        "https://www.algobuddy.me",
        "https://algobuddy.me"
      ];
      if (allowed.includes(origin) || origin.endsWith(".vercel.app")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
  },
  adapter: createAdapter(pubClient, subClient)
});

const PORT = process.env.PORT || 4000;

// Rate Limiting Config
const MAX_TOKENS = 10;
const REFILL_RATE_MS = 200;

async function isRateLimited(socketId) {
  const key = `ratelimit:${socketId}`;
  const now = Date.now();
  
  // Use a simple Lua script for atomic rate limiting token bucket
  const script = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local max_tokens = tonumber(ARGV[2])
    local refill_rate = tonumber(ARGV[3])
    
    local data = redis.call('HMGET', key, 'tokens', 'lastRequestTime')
    local tokens = tonumber(data[1])
    local lastRequestTime = tonumber(data[2])
    
    if not tokens then
      redis.call('HMSET', key, 'tokens', max_tokens - 1, 'lastRequestTime', now)
      redis.call('EXPIRE', key, 60)
      return 0
    end
    
    local timePassed = now - lastRequestTime
    local tokensToAdd = math.floor(timePassed / refill_rate)
    
    if tokensToAdd > 0 then
      tokens = math.min(max_tokens, tokens + tokensToAdd)
      lastRequestTime = now
    end
    
    if tokens > 0 then
      redis.call('HMSET', key, 'tokens', tokens - 1, 'lastRequestTime', lastRequestTime)
      redis.call('EXPIRE', key, 60)
      return 0
    end
    return 1
  `;
  
  const result = await redisClient.eval(script, 1, key, now, MAX_TOKENS, REFILL_RATE_MS);
  return result === 1; // 1 means rate limited, 0 means allowed
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join_matchmaking", async (data) => {
    if (await isRateLimited(socket.id)) return;
    
    const targetTopic = data.topic || "Arrays";
    const targetDifficulty = data.difficulty || "Easy";
    const queueKey = `queue:${targetTopic}:${targetDifficulty}`;

    // Remove any existing entry for this user across all possible queues to prevent duplicates
    const existingQueueKey = await redisClient.hget(`socket:${socket.id}`, "queueKey");
    if (existingQueueKey) {
      const elements = await redisClient.lrange(existingQueueKey, 0, -1);
      for (const el of elements) {
        const parsed = JSON.parse(el);
        if (parsed.socketId === socket.id || parsed.userId === data.userId) {
          await redisClient.lrem(existingQueueKey, 0, el);
        }
      }
    }

    // Try to find an opponent
    let matchFound = false;
    while (!matchFound) {
      const opponentStr = await redisClient.lpop(queueKey);
      if (!opponentStr) {
        break; // Queue is empty
      }
      
      const opponent = JSON.parse(opponentStr);
      if (opponent.userId === data.userId) {
        // Same user (e.g. ghost queue entry), ignore them and pop next
        continue; 
      }
      
      // Match found!
      matchFound = true;
      const matchId = `match-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const matchDetails = {
        matchId,
        topic: targetTopic,
        difficulty: targetDifficulty,
        status: "in-progress",
        players: [
          { userId: opponent.userId, name: opponent.name, socketId: opponent.socketId },
          { userId: data.userId, name: data.name, socketId: socket.id },
        ],
      };

      // Save to active matches state globally
      await redisClient.set(`match:${matchId}`, JSON.stringify(matchDetails));
      await redisClient.hset(`socket:${socket.id}`, "matchId", matchId);
      await redisClient.hset(`socket:${opponent.socketId}`, "matchId", matchId);
      await redisClient.hdel(`socket:${socket.id}`, "queueKey");
      await redisClient.hdel(`socket:${opponent.socketId}`, "queueKey");

      // Notify both players
      io.to(opponent.socketId).emit("match_found", matchDetails);
      io.to(socket.id).emit("match_found", matchDetails);

      // Join room for real-time duel syncing using socket.io adapter's remote join feature
      socket.join(matchId);
      io.in(opponent.socketId).socketsJoin(matchId);
      
      console.log(`Match found: ${opponent.userId} vs ${data.userId}`);
      break;
    }

    if (!matchFound) {
      // Add to queue
      const queueData = JSON.stringify({ ...data, topic: targetTopic, difficulty: targetDifficulty, socketId: socket.id });
      await redisClient.rpush(queueKey, queueData);
      await redisClient.hset(`socket:${socket.id}`, "queueKey", queueKey);
      console.log(`Added to queue ${queueKey}`);
    }
  });

  socket.on("leave_matchmaking", async () => {
    if (await isRateLimited(socket.id)) return;
    const existingQueueKey = await redisClient.hget(`socket:${socket.id}`, "queueKey");
    if (existingQueueKey) {
      const elements = await redisClient.lrange(existingQueueKey, 0, -1);
      for (const el of elements) {
        const parsed = JSON.parse(el);
        if (parsed.socketId === socket.id) {
          await redisClient.lrem(existingQueueKey, 0, el);
        }
      }
      await redisClient.hdel(`socket:${socket.id}`, "queueKey");
    }
  });

  socket.on("join_match", async (data) => {
    socket.join(data.matchId);
  });

  // Duel Room Events
  socket.on("code_update", async (data) => {
    if (await isRateLimited(socket.id)) return;
    socket.to(data.matchId).emit("opponent_code_update", {
      code: data.code,
      userId: data.userId
    });
  });

  socket.on("test_submit", async (data) => {
    if (await isRateLimited(socket.id)) return;
    socket.to(data.matchId).emit("opponent_test_submit", { userId: data.userId });
  });

  socket.on("test_result", async (data) => {
    if (await isRateLimited(socket.id)) return;
    
    const matchId = await redisClient.hget(`socket:${socket.id}`, "matchId");
    if (!matchId || matchId !== data.matchId) return;

    socket.to(data.matchId).emit("opponent_test_result", {
      userId: data.userId,
      passed: data.passed,
      total: data.total,
      status: data.status
    });
  });

  socket.on("match_complete", async (data) => {
    if (await isRateLimited(socket.id)) return;
    
    const matchId = await redisClient.hget(`socket:${socket.id}`, "matchId");
    if (!matchId || matchId !== data.matchId) return;
    
    const matchStr = await redisClient.get(`match:${matchId}`);
    if (matchStr) {
      const match = JSON.parse(matchStr);
      if (match.status !== "completed") {
        match.status = "completed";
        await redisClient.set(`match:${matchId}`, JSON.stringify(match));
        
        io.in(matchId).emit("match_ended", { winnerId: data.winnerId });
        
        for (const p of match.players) {
          await redisClient.hdel(`socket:${p.socketId}`, "matchId");
        }
        await redisClient.expire(`match:${matchId}`, 60 * 60); // Keep for 1 hour for debugging
      }
    }
  });

  socket.on("disconnect", async () => {
    // 1. Remove from matchmaking queue if present
    const existingQueueKey = await redisClient.hget(`socket:${socket.id}`, "queueKey");
    if (existingQueueKey) {
      const elements = await redisClient.lrange(existingQueueKey, 0, -1);
      for (const el of elements) {
        const parsed = JSON.parse(el);
        if (parsed.socketId === socket.id) {
          await redisClient.lrem(existingQueueKey, 0, el);
        }
      }
    }
    
    // 2. Handle active match disconnects
    const matchId = await redisClient.hget(`socket:${socket.id}`, "matchId");
    if (matchId) {
      const matchStr = await redisClient.get(`match:${matchId}`);
      if (matchStr) {
        const match = JSON.parse(matchStr);
        if (match.status !== "completed") {
          match.status = "completed";
          await redisClient.set(`match:${matchId}`, JSON.stringify(match));
          
          const opponent = match.players.find(p => p.socketId !== socket.id);
          if (opponent) {
            io.to(opponent.socketId).emit("opponent_disconnected", { winnerId: opponent.userId });
          }
          
          for (const p of match.players) {
            await redisClient.hdel(`socket:${p.socketId}`, "matchId");
          }
        }
      }
    }
    
    await redisClient.del(`socket:${socket.id}`);
    await redisClient.del(`ratelimit:${socket.id}`);
    console.log(`User disconnected: ${socket.id}`);
  });
});

app.get("/debug", async (req, res) => {
  res.json({
    status: "Redis migration complete. Queue details are stored in Redis.",
    activeConnections: io.engine.clientsCount
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "Arena Socket Server is running with Redis!" });
});

server.listen(PORT, () => {
  console.log(`Arena Socket Server running on port ${PORT}`);
});
