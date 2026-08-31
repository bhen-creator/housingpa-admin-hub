import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import DailyReportSettings from "./pages/DailyReportSettings";
import ToolSettings from "./pages/ToolSettings";
import { trpc } from "./lib/trpc";
import { DashboardLayoutSkeleton } from "./components/DashboardLayoutSkeleton";

function Router() {
  const publicModeQuery = trpc.publicHub.mode.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (publicModeQuery.isLoading) return <DashboardLayoutSkeleton />;

  const publicReadOnly = publicModeQuery.data?.enabled === true;

  return (
    <DashboardLayout publicReadOnly={publicReadOnly}>
      <Switch>
        <Route path="/">{() => <Home publicReadOnly={publicReadOnly} />}</Route>
        {publicReadOnly ? (
          <>
            <Route path="/settings">
              <Redirect to="/" replace />
            </Route>
            <Route path="/settings/reports/daily">
              <Redirect to="/" replace />
            </Route>
          </>
        ) : (
          <>
            <Route path="/settings" component={ToolSettings} />
            <Route path="/settings/reports/daily" component={DailyReportSettings} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
