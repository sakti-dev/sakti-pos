import { Router, Route, Navigate } from "@solidjs/router";
import "./index.css";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import POS from "./pages/POS";
import MenuManagement from "./pages/MenuManagement";
import OrderHistory from "./pages/OrderHistory";
import Users from "./pages/Users";
import Settings from "./pages/Settings";

function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={() => <Navigate href="/pos" />} />
      <Route path="/login" component={Login} />
      <Route path="/pos" component={POS} />
      <Route path="/menu" component={MenuManagement} />
      <Route path="/orders" component={OrderHistory} />
      <Route path="/users" component={Users} />
      <Route path="/settings" component={Settings} />
    </Router>
  );
}

export default App;
