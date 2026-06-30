"use client";

import Link from "next/link";

const quizzes = [
  {
    title: "Basic Recursion Quiz",
    href: "/visualizer/recursion/basic-recursion/quiz",
  },
  {
    title: "Functional & Parameterized Recursion Quiz",
    href: "/visualizer/recursion/functional-parameterized/quiz",
  },
  {
    title: "Multiple Recursive Calls Quiz",
    href: "/visualizer/recursion/multiple-calls/quiz",
  },
  {
    title: "Recursion on Subsequences Quiz",
    href: "/visualizer/recursion/subsequences/quiz",
  },
  {
    title: "Backtracking Quiz",
    href: "/visualizer/recursion/backtracking/quiz",
  },
  {
    title: "Recursion Trees Quiz",
    href: "/visualizer/recursion/trees/quiz",
  },
  {
    title: "Call Stack Visualization Quiz",
    href: "/visualizer/recursion/stack/quiz",
  },
  {
    title: "Recursive Binary Search Quiz",
    href: "/visualizer/recursion/binary-search/quiz",
  },
  {
    title: "Tower of Hanoi Quiz",
    href: "/visualizer/recursion/tower-of-hanoi/quiz",
  },
];

export default function RecursionQuizClient() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-center text-4xl font-bold">
          Recursion Quiz
        </h1>

        <p className="mb-10 text-center text-muted-foreground">
          Choose a recursion topic to test your understanding.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {quizzes.map((quiz) => (
            <div
              key={quiz.title}
              className="rounded-xl border bg-card p-6 shadow-sm"
            >
              <h2 className="mb-4 text-2xl font-semibold">
                {quiz.title}
              </h2>

              <Link
                href={quiz.href}
                className="inline-flex rounded-lg bg-purple-600 px-5 py-2.5 font-medium text-white hover:bg-purple-700"
              >
                Start Quiz
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}