import {
  Card,
  CardActionArea,
  CardContent,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import AddBoxIcon from "@mui/icons-material/AddBox";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LayoutPrincipal from "../layouts/LayoutPrincipal";

export default function InicioPage() {
  const navigate = useNavigate();
  const { usuario } = useAuth();

  return (
    <LayoutPrincipal>
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Typography variant="h6" gutterBottom>
          Hola, {usuario?.nombre}
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Rol: {usuario?.rol}
        </Typography>

        <Stack spacing={2} sx={{ mt: 2 }}>
          <Card>
            <CardActionArea
              onClick={() => navigate("/ordenes/nueva")}
              sx={{ p: 2 }}
            >
              <CardContent
                sx={{ display: "flex", alignItems: "center", gap: 2, p: 0 }}
              >
                <AddBoxIcon color="primary" fontSize="large" />
                <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
                  Registrar nueva orden
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Stack>
      </Container>
    </LayoutPrincipal>
  );
}
