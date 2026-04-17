import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function DashboardListPage() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/", { replace: true }); }, [navigate]);
  return null;
}
