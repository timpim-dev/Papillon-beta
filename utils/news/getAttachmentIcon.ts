import { Attachment } from "@/services/shared/attachment";
import { classifyAttachment } from "@/utils/attachments/classify";

export const getAttachmentIcon = (attachment: Attachment) => {
  const kind = classifyAttachment(attachment);
  switch (kind) {
    case "audio":
      return "Volume";
    case "image":
      return "Gallery";
    case "video":
      return "Play";
    case "link":
      return "Link";
    case "pdf":
    case "text":
    case "document":
    default:
      return "Paper";
  }
};
