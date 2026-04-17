import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareBtnProps {
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "default";
}

export function ShareBtn({ onClick, disabled, size = "sm" }: ShareBtnProps) {
  return (
    <Button variant="outline" size={size} onClick={onClick} disabled={disabled}>
      <Share2 className="h-4 w-4 mr-1.5" />
      Share
    </Button>
  );
}
