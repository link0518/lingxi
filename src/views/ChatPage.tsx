import { useParams } from "react-router-dom";
import { ChatPane } from "./ChatPane";
import { GrainOverlay } from "../ui/GrainOverlay";
import { GradientBackground } from "../ui/GradientBackground";

export function ChatPage() {
  const { sessionId } = useParams();
  if (!sessionId) return null;
  return (
    <>
      <GrainOverlay />
      <GradientBackground />
      <ChatPane sessionId={sessionId} embedded={false} />
    </>
  );
}
