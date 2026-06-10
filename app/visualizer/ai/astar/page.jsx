

import Animation from "./animation";
import ExploreOther from "@/app/components/ui/exploreOther";
import Code from "./codeBlock";
import Quiz from "./quiz";
import Content from "./content";
import ModuleCard from "@/app/components/ui/ModuleCard";
import VisualizerPageLayout, { createVisualizerPaths } from "@/app/visualizer/components/VisualizerPageLayout";
import { MODULE_MAPS } from "@/lib/modulesMap";
import ClientVisualizer from "./ClientVisualizer";

export const metadata = {
  title: "A* Search | Step-by-Step Animation",
  description:
    "Visualize A* Search with heuristic-driven pathfinding, open and closed sets, and shortest-path reconstruction.",
  keywords: [
    "A* Search Visualizer",
    "A Star Search Visualization",
    "A* Pathfinding",
    "Heuristic Search",
    "Grid Pathfinding",
    "Optimal Path Search",
    "Admissible Heuristic",
    "AI Algorithms",
  ],
  robots: "index, follow",
};

export default function Page() {
  return <ClientVisualizer />;
}
