import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

import { AttachmentViewerModal } from "@/components/attachments/AttachmentViewerModal";

export default function AttachmentModalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    name?: string;
    url?: string;
    type?: string;
  }>();

  const url = typeof params.url === "string" ? params.url : "";
  const name = typeof params.name === "string" ? params.name : undefined;
  const typeNum =
    typeof params.type === "string" && params.type !== ""
      ? Number(params.type)
      : 1;

  return (
    <AttachmentViewerModal
      name={name}
      url={url}
      type={Number.isFinite(typeNum) ? typeNum : 1}
      onClose={() => router.back()}
    />
  );
}
