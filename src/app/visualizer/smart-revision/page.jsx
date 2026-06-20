import SmartRevisionFlashcards from "@/app/components/SmartRevisionFlashcards";

export const metadata = {
  title: "Smart Revision | AlgoBuddy",
  description: "Revise completed DSA topics and practice with flashcards to test your knowledge.",
};

export default function SmartRevisionPage() {
  return (
    <div className="min-h-screen p-8 bg-white dark:bg-[#1c1d1f] text-black dark:text-white flex flex-col items-center justify-center">
      <SmartRevisionFlashcards />
    </div>
  );
}