"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";

export default function LandingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    // Check if user is already authenticated
    if (session) {
      router.push("/create");
    } else {
      setIsLoading(false);
    }
  }, [session, router]);

  const handleGetStarted = () => {
    if (session) {
      router.push("/create");
    } else {
      router.push("/auth/signup");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="nav-clean border-b px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">🐼</span>
            </div>
            <h1 className="text-xl font-bold text-foreground font-['Delius_Swash_Caps']">
              TutoPanda
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.push("/auth/login")}>
              Sign In
            </Button>
            <Button onClick={handleGetStarted}>
              Get Started
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-8 leading-tight">
            Create Interactive
            <span className="text-primary block">Video Learning</span>
            Experiences
          </h1>

          <p className="text-xl text-muted-foreground mb-12 leading-relaxed max-w-2xl mx-auto">
            Transform your educational content into engaging, interactive videos
            that keep learners engaged and improve comprehension.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={handleGetStarted} className="text-lg px-8 py-6">
              Get Started Free
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8 py-6">
              Watch Demo
            </Button>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-32 grid md:grid-cols-3 gap-8">
          <div className="card-clean p-8 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl">🎥</span>
            </div>
            <h3 className="text-xl font-semibold mb-4">Interactive Timeline</h3>
            <p className="text-muted-foreground">
              Create engaging video timelines with interactive elements and annotations.
            </p>
          </div>

          <div className="card-clean p-8 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl">🧠</span>
            </div>
            <h3 className="text-xl font-semibold mb-4">AI-Powered</h3>
            <p className="text-muted-foreground">
              Leverage AI to enhance your content and create better learning experiences.
            </p>
          </div>

          <div className="card-clean p-8 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-6">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-xl font-semibold mb-4">Analytics</h3>
            <p className="text-muted-foreground">
              Track learner engagement and optimize your content for better results.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}