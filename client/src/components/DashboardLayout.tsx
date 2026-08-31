import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Compass,
  Grid2X2,
  LogOut,
  PanelLeft,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { FormEvent } from "react";

const menuItems = [
  { icon: Grid2X2, label: "Tool hub", path: "/" },
  { icon: Settings2, label: "Tool settings", path: "/settings" },
  {
    icon: CalendarClock,
    label: "Daily report",
    path: "/settings/reports/daily",
  },
];

const SIDEBAR_WIDTH_KEY = "housingpa-admin-sidebar-width";
const DEFAULT_WIDTH = 278;
const MIN_WIDTH = 220;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
  publicReadOnly = false,
}: {
  children: React.ReactNode;
  publicReadOnly?: boolean;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth({ enabled: !publicReadOnly });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (!publicReadOnly && loading) return <DashboardLayoutSkeleton />;

  if (!publicReadOnly && !user) {
    return <SignInScreen />;
  }

  if (!publicReadOnly && user?.role !== "admin") {
    return <RestrictedScreen />;
  }

  if (publicReadOnly) {
    return <main className="min-h-screen bg-[#f5f4ef] dark:bg-[#101a1c]">{children}</main>;
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      className="min-h-screen bg-[#f5f4ef] dark:bg-[#101a1c]"
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function SignInScreen() {
  const { loginWithCredentials, isCredentialLoginPending } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submitCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await loginWithCredentials({ username, password });
    } catch {
      setError("The administrator credentials were not accepted.");
    }
  };

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[#0c1b1e] px-6 py-8 text-[#f8f6ef] place-items-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(96,168,150,0.20),transparent_28%),radial-gradient(circle_at_85%_85%,rgba(213,166,101,0.13),transparent_24%)]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-sm sm:p-10">
        <BrandLockup />
        <div className="mt-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d9b879]">
            Administrator access
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.08] tracking-[-0.04em] sm:text-5xl">
            A considered place to work.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/65">
            Sign in with your authorized HousingPA account to access the
            internal tool hub.
          </p>
        </div>
        <form className="mt-8 space-y-4" onSubmit={submitCredentials}>
          <div className="space-y-1.5">
            <Label
              htmlFor="admin-username"
              className="text-xs font-semibold text-white/70"
            >
              Username
            </Label>
            <Input
              id="admin-username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              required
              className="h-11 rounded-xl border-white/12 bg-white/10 text-white placeholder:text-white/35"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="admin-password"
              className="text-xs font-semibold text-white/70"
            >
              Password
            </Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-11 rounded-xl border-white/12 bg-white/10 text-white placeholder:text-white/35"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-[#f5bf9e]">
              {error}
            </p>
          )}
          <Button
            disabled={isCredentialLoginPending}
            className="h-12 w-full rounded-xl bg-[#d9b879] text-sm font-semibold text-[#172528] shadow-[0_12px_30px_rgba(0,0,0,0.24)] transition hover:bg-[#edd39e] active:scale-[0.98]"
          >
            {isCredentialLoginPending ? "Signing in…" : "Sign in securely"}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs leading-5 text-white/40">
          Restricted to approved administrators.
        </p>
      </section>
    </main>
  );
}

function RestrictedScreen() {
  const { logout } = useAuth();

  return (
    <main className="grid min-h-screen bg-[#f5f4ef] px-6 place-items-center text-[#172528]">
      <section className="max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-[#cbd5cd] bg-white text-[#3f7969] shadow-sm">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-[#4b7b6e]">
          Access restricted
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-[-0.04em]">
          Administrator permission required.
        </h1>
        <p className="mt-4 text-sm leading-6 text-[#60706d]">
          Your account is authenticated but does not have access to the
          HousingPA Admin hub. Contact a workspace administrator if this appears
          to be in error.
        </p>
        <Button
          variant="outline"
          onClick={logout}
          className="mt-8 rounded-xl border-[#b8c4bd] bg-white px-5 text-[#244740] hover:bg-[#eaf0eb]"
        >
          Sign out
        </Button>
      </section>
    </main>
  );
}

function BrandLockup() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#d9b879] text-[#172528] shadow-sm">
        <Compass className="h-4.5 w-4.5" strokeWidth={2.25} />
      </span>
      <div>
        <p className="font-serif text-xl leading-none tracking-[-0.04em]">
          housingpa
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Admin
        </p>
      </div>
    </div>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const activeMenuItem =
    menuItems.find(item => item.path === location) ?? menuItems[0];

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - sidebarLeft;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };

    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-white/10 bg-[#102326] text-[#f8f6ef]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-[82px] justify-center border-b border-white/10 px-4">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-white/70 transition hover:bg-white/[0.13] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9b879]"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              {!isCollapsed && <BrandLockup />}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-3 py-6">
            {!isCollapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Workspace
              </p>
            )}
            <SidebarMenu className="gap-1">
              {menuItems.map(item => {
                const isActive = item.path === location;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => setLocation(item.path)}
                      className={cn(
                        "h-11 rounded-xl px-3 text-white/65 transition hover:bg-white/[0.075] hover:text-white",
                        isActive && "bg-[#37685d] text-white hover:bg-[#37685d]"
                      )}
                    >
                      <item.icon
                        className="h-4 w-4"
                        strokeWidth={isActive ? 2.3 : 2}
                      />
                      <span className="font-medium">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-white/10 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/[0.075] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d9b879] group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-8 w-8 shrink-0 border border-white/10">
                    <AvatarFallback className="bg-[#d9b879] text-xs font-bold text-[#172528]">
                      {user?.name?.charAt(0).toUpperCase() || "A"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium text-white/90">
                      {user?.name || "Administrator"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/42">
                      HousingPA admin
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                className="w-48 rounded-xl"
              >
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        {!isCollapsed && (
          <div
            className="absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition hover:bg-[#d9b879]/70"
            onMouseDown={() => setIsResizing(true)}
          />
        )}
      </div>

      <SidebarInset className="min-w-0 bg-[#f5f4ef] dark:bg-[#101a1c]">
        {isMobile && (
          <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-[#dae0d9] bg-[#f5f4ef]/90 px-4 backdrop-blur dark:border-[#2d4846] dark:bg-[#101a1c]/90">
            <SidebarTrigger className="h-9 w-9 rounded-xl border border-[#d4ddd5] bg-white dark:border-[#42615c] dark:bg-[#18302f] dark:text-[#d5eee5]" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5e9383] dark:text-[#93c7b7]">
                HousingPA
              </p>
              <p className="font-serif text-lg leading-none text-[#172528] dark:text-[#edf7f3]">
                {activeMenuItem.label}
              </p>
            </div>
          </header>
        )}
        <main className="min-h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}
