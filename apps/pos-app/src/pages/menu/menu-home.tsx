import { useNavigate } from "@solidjs/router";

export default function MenuHome() {
  const navigate = useNavigate();
  navigate("/settings/products-categories", { replace: true });
  return null;
}
