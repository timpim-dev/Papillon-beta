import React from "react";

import CommunicationsScreen from "@/components/communications/CommunicationsScreen";
import MainTabErrorBoundary from "@/ui/components/MainTabErrorBoundary";

export default function CommunicationsFeatureRoute() {
  return (
    <MainTabErrorBoundary>
      <CommunicationsScreen isModal />
    </MainTabErrorBoundary>
  );
}
