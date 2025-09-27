"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import type { ChatStatus } from "ai";

import { createProjectWithLectureAction } from "@/app/actions/create-project";
import {
  PromptInput,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputSubmit,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { SelectProject } from "@/db/app-schema";
import { AppSidebarShell } from "@/components/app-sidebar-shell";

const SAMPLE_PROMPTS = [
  "Create a lecture outlining the key events of the American Revolution.",
  "Explain the causes and consequences of the Industrial Revolution in Europe.",
  "Summarize the major turning points of the Cold War for a 10-minute lesson.",
];

type CreatePageContentProps = {
  projects: Pick<SelectProject, "id" | "name">[];
};

export function CreatePageContent({ projects }: CreatePageContentProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>();
  const [isPending, startTransition] = useTransition();
  const errorResetTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (errorResetTimeout.current) {
        window.clearTimeout(errorResetTimeout.current);
      }
    };
  }, []);

  const handlePromptSubmit = (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>
  ) => {
    const text = message.text?.trim();

    if (!text || isPending) {
      return;
    }

    const formElement = event.currentTarget;
    setSubmitStatus("submitted");

    startTransition(() => {
      createProjectWithLectureAction({ prompt: text })
        .then(({ projectId }) => {
          formElement.reset();
          setPrompt("");
          setSubmitStatus(undefined);
          router.push(`/edit?projectId=${projectId}`);
        })
        .catch((error) => {
          console.error("Failed to create project", error);
          setSubmitStatus("error");
          toast({
            title: "Something went wrong",
            description: "We couldn't start the lecture. Please try again.",
            variant: "destructive",
          });
          if (errorResetTimeout.current) {
            window.clearTimeout(errorResetTimeout.current);
          }
          errorResetTimeout.current = window.setTimeout(() => {
            setSubmitStatus(undefined);
            errorResetTimeout.current = null;
          }, 2000);
        });
    });
  };

  const handleSamplePrompt = (sample: string) => {
    setPrompt(sample);
  };

  return (
    <AppSidebarShell projects={projects} sidebarDefaultOpen>
      <div className="flex h-full flex-1 items-center justify-center px-6 py-10">
        <div className="flex w-full max-w-2xl flex-col gap-8">
          <div className="flex flex-col gap-3 text-center md:text-left">
            <h1 className="text-2xl font-semibold text-foreground">Create a new lecture</h1>
            <p className="text-sm text-muted-foreground">
              Describe what you want to teach and we&apos;ll take it from there.
            </p>
          </div>
          <div className="flex w-full flex-col gap-4">
            <PromptInput
              onSubmit={handlePromptSubmit}
              className="w-full border border-[color:var(--surface-border)] bg-[color:var(--surface-elevated)] shadow-lg"
              maxFiles={5}
              maxFileSize={10 * 1024 * 1024}
            >
              <PromptInputAttachments>
                {(attachment) => <PromptInputAttachment data={attachment} />}
              </PromptInputAttachments>
              <PromptInputBody>
                <PromptInputTextarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="e.g. Create a 5-minute lesson about the fall of the Roman Empire for middle school students."
                  className="text-base"
                />
                <PromptInputToolbar>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                  </PromptInputTools>
                  <PromptInputSubmit status={submitStatus} disabled={isPending} variant="secondary" />
                </PromptInputToolbar>
              </PromptInputBody>
            </PromptInput>
            <div className="flex flex-col gap-1 text-left">
              {SAMPLE_PROMPTS.map((sample) => (
                <Button
                  key={sample}
                  type="button"
                  variant="ghost"
                  className="justify-start px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  disabled={isPending}
                  onClick={() => handleSamplePrompt(sample)}
                >
                  {sample}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppSidebarShell>
  );
}
