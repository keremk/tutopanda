"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem,
  TaskItemFile,
} from "@/components/ai-elements/task";
import { cn } from "@/lib/utils";
import { BrainIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";

interface AgentProgressProps {
  className?: string;
}

export const AgentProgress = ({ className }: AgentProgressProps) => {
  // Mock data for demonstration - will be replaced with real data later
  const [tasks] = useState([
    {
      id: "1",
      title: "Analyzing codebase structure",
      items: [
        "Found 23 React components",
        "Identified 5 custom hooks",
        "Located configuration files",
      ],
      files: ["package.json", "tsconfig.json"],
      completed: true,
    },
    {
      id: "2",
      title: "Processing user request",
      items: [
        "Understanding requirements",
        "Planning implementation steps",
      ],
      files: ["src/components/ui/button.tsx"],
      completed: false,
    },
  ]);

  const hasActiveTasks = tasks.length > 0;

  if (!hasActiveTasks) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <BrainIcon className="size-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">
          No active tasks
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Start a conversation to see AI progress and task breakdowns here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="p-4 space-y-4">
        {tasks.map((task) => (
          <Task key={task.id} defaultOpen={!task.completed}>
            <TaskTrigger title={task.title} />
            <TaskContent>
              {task.items.map((item, index) => (
                <TaskItem key={index}>{item}</TaskItem>
              ))}
              {task.files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {task.files.map((file, index) => (
                    <TaskItemFile key={index}>
                      <FileTextIcon className="size-3" />
                      {file}
                    </TaskItemFile>
                  ))}
                </div>
              )}
            </TaskContent>
          </Task>
        ))}
      </div>
    </ScrollArea>
  );
};