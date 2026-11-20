/**
 * Mapa de rutas del frontend.
 *
 *  /login            común a todos
 *  /app/*            app móvil del OPERADOR (Etapa 5)
 *  /panel, /ordenes… panel de ADMINISTRADOR y FINANCIERO
 *                    (pantallas anteriores; se rehacen en la Etapa 4)
 *
 * Cada rol solo entra a lo suyo (RutaProtegida). El backend vuelve a validar
 * los permisos en cada petición.
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { inicioPorRol } from "./utils/roles";
import RutaProtegida from "./routes/RutaProtegida";
import LoginPage from "./pages/LoginPage";
import ListadoOrdenesPage from "./pages/ListadoOrdenesPage";
import DetalleOrdenPage from "./pages/DetalleOrdenPage";
import PanelPage from "./pages/PanelPage";
import MonitoreoPage from "./pages/MonitoreoPage";
import OperadorLayout from "./layouts/OperadorLayout";
import InicioOperador from "./pages/operador/InicioOperador";
import IniciarTurno from "./pages/operador/IniciarTurno";
import FinalizarTurno from "./pages/operador/FinalizarTurno";
import HistorialTurnos from "./pages/operador/HistorialTurnos";
import MisServicios from "./pages/operador/MisServicios";
import NuevoServicio from "./pages/operador/NuevoServicio";
import DetalleServicio from "./pages/operador/DetalleServicio";
import FinalizarServicio from "./pages/operador/FinalizarServicio";
import Perfil from "./pages/operador/Perfil";

const ADMIN = ["administrador", "financiero"];

// "/" lleva a la pantalla de inicio de cada rol
function Raiz() {
  const { usuario } = useAuth();
  return <Navigate to={usuario ? inicioPorRol(usuario.rol) : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RutaProtegida><Raiz /></RutaProtegida>} />

      {/* ---------- App móvil del operador ---------- */}
      <Route
        path="/app"
        element={
          <RutaProtegida roles={["operador"]}>
            <OperadorLayout />
          </RutaProtegida>
        }
      >
        <Route index element={<InicioOperador />} />
        <Route path="turno/iniciar" element={<IniciarTurno />} />
        <Route path="turno/finalizar" element={<FinalizarTurno />} />
        <Route path="turnos" element={<HistorialTurnos />} />
        <Route path="servicios" element={<MisServicios />} />
        <Route path="servicios/nuevo" element={<NuevoServicio />} />
        <Route path="servicios/:id" element={<DetalleServicio />} />
        <Route path="servicios/:id/finalizar" element={<FinalizarServicio />} />
        <Route path="perfil" element={<Perfil />} />
      </Route>

      {/* ---------- Administración (provisional hasta la Etapa 4) ---------- */}
      <Route path="/panel" element={<RutaProtegida roles={ADMIN}><PanelPage /></RutaProtegida>} />
      <Route path="/ordenes" element={<RutaProtegida roles={ADMIN}><ListadoOrdenesPage /></RutaProtegida>} />
      <Route path="/ordenes/:id" element={<RutaProtegida roles={ADMIN}><DetalleOrdenPage /></RutaProtegida>} />
      <Route path="/monitoreo" element={<RutaProtegida roles={["administrador"]}><MonitoreoPage /></RutaProtegida>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
