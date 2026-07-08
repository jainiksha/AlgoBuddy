// src/app/hooks/useAuth.js
"use client";
import { useContext } from "react";
import { AuthContext } from "@/app/context/AuthContext"; // Adjust based on your auth setup

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
