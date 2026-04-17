import { Navigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

interface Props {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
