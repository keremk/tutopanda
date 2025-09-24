"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LogOut, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/hooks/use-toast";

const navigationItems = [
  { name: "Create", href: "/create" },
  { name: "Learn", href: "/learn" },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = authClient.useSession();

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      toast({
        title: "Success",
        description: "Logged out successfully!",
      });
      router.push("/");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
      console.error("Logout error:", error);
    }
  };

  return (
    <nav className="nav-clean">
      <div className="flex h-16 items-center px-6">
        <div className="mr-8 flex">
          <Link className="mr-8 flex items-center space-x-3" href="/">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">🐼</span>
            </div>
            <span className="font-bold text-xl text-foreground">TutoPanda</span>
          </Link>
          <nav className="flex items-center space-x-8 text-base font-medium">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "transition-all duration-200 hover:text-primary px-3 py-2 rounded-md",
                  pathname?.startsWith(item.href)
                    ? "text-primary bg-primary/10 shadow-sm"
                    : "text-foreground/70 hover:bg-accent/50"
                )}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-4">
          <ThemeSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-9 w-9 cursor-pointer ring-2 ring-primary/20 hover:ring-primary/40 transition-all duration-200">
                <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || "User"} />
                <AvatarFallback className="bg-secondary text-secondary-foreground font-bold">
                  {session?.user?.name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 shadow-lg border-0" align="end" forceMount>
              <div className="px-3 py-2 text-sm">
                <p className="font-medium">{session?.user?.name || "User"}</p>
                <p className="text-muted-foreground text-xs">{session?.user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/account" className="flex items-center">
                  <User className="mr-3 h-4 w-4" />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-3 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}