import React from "react";

import CommunicationsScreen from "@/components/communications/CommunicationsScreen";
import MainTabErrorBoundary from "@/ui/components/MainTabErrorBoundary";

export default function CommunicationsTabIndex() {
  return (
    <MainTabErrorBoundary>
      <CommunicationsScreen />
    </MainTabErrorBoundary>
  );
}
