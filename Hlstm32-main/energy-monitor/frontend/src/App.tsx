import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { DashboardProvider } from "./state/DashboardContext";
import Overview from "./pages/Overview";
import LiveMonitor from "./pages/LiveMonitor";
import Analytics from "./pages/Analytics";
import Alerts from "./pages/Alerts";
import Devices from "./pages/Devices";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <DashboardProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="/live" element={<LiveMonitor />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </DashboardProvider>
  );
}
