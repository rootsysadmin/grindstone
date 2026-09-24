import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GameProvider } from "./state/gameContext.tsx";
import { Shell } from "./components/Shell.tsx";
import { TodayPage } from "./features/today/TodayPage.tsx";
import { RosterPage } from "./features/roster/RosterPage.tsx";
import { CharacterDetailPage } from "./features/roster/CharacterDetailPage.tsx";
import { PlannerPage } from "./features/planner/PlannerPage.tsx";
import { CalendarPage } from "./features/calendar/CalendarPage.tsx";
import { WishlistPage } from "./features/wishlist/WishlistPage.tsx";
import { MasterDataPage } from "./features/master-data/MasterDataPage.tsx";
import { SpendPage } from "./features/spend/SpendPage.tsx";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GameProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Navigate to="/today" replace />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/roster" element={<RosterPage />} />
            <Route path="/roster/:id" element={<CharacterDetailPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/spend" element={<SpendPage />} />
              <Route path="/data" element={<MasterDataPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </GameProvider>
    </QueryClientProvider>
  );
}
