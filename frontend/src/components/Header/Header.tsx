import { Bell, Settings, TrendingUp } from "lucide-react";
import "./Header.css";

export const DashboardHeader = () => {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-logo">
          <TrendingUp className="header-logo-icon" />
        </div>
        <h1 className="header-title">OptiInvest</h1>
        <div className="header-badge">
          Market Intelligence Platform
        </div>
        
        <div className="header-status">
          <div className="header-status-dot"></div>
          <span className="header-status-text">Live Data Connected</span>
        </div>
        
        <button className="header-button">
          <Bell className="header-button-icon" />
        </button>
        
        <button className="header-button">
          <Settings className="header-button-icon" />
        </button>
      </div>
    </header>
  );
};