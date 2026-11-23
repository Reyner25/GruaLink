/**
 * Mapa de rutas del frontend.
 *
 *  /login            común a todos
 *  /app/*            app móvil del OPERADOR (Etapa 5)
 *  /admin/*          panel de ADMINISTRADOR y FINANCIERO (Etapa 4)
 *  /panel, /ordenes… direcciones anteriores: redirigen a /admin
 *
 * Cada rol solo entra a lo suyo (RutaProtegida). El backend vuelve a validar
 * los permisos en cada petición.
 */
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { inicioPorRol } from "./utils/roles";
import RutaProtegida from "./routes/RutaProtegida";
import LoginPage from "./pages/LoginPage";
import OperadorLayout from "./layouts/OperadorLayout";
import AdminLayout from "./layouts/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Servicios from "./pages/admin/Servicios";
import ServicioDetalle from "./pages/admin/ServicioDetalle";
import PromedioGruas from "./pages/admin/PromedioGruas";
import BolsaKm from "./pages/admin/BolsaKm";
import PagoOperadores from "./pages/admin/PagoOperadores";
import Bitacora from "./pages/admin/Bitacora";
import Clientes from "./pages/admin/Clientes";
import Gruas from "./pages/admin/Gruas";
import Usuarios from "./pages/admin/Usuarios";
import Tarifas from "./pages/admin/Tarifas";
import Catalogos from "./pages/admin/Catalogos";
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

      {/* ---------- Panel administrativo ---------- */}
      <Route
        path="/admin"
        element={
          <RutaProtegida roles={ADMIN}>
            <AdminLayout />
          </RutaProtegida>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="servicios" element={<Servicios />} />
        <Route path="servicios/:id" element={<ServicioDetalle />} />
        <Route path="reportes/promedio-gruas" element={<PromedioGruas />} />
        <Route path="reportes/bolsa-km" element={<BolsaKm />} />
        <Route path="reportes/pago-operadores" element={<PagoOperadores />} />
        <Route path="tarifas" element={<Tarifas />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="gruas" element={<Gruas />} />
        <Route path="catalogos" element={<Catalogos />} />
        <Route path="usuarios" element={<RutaProtegida roles={["administrador"]}><Usuarios /></RutaProtegida>} />
        <Route path="bitacora" element={<RutaProtegida roles={["administrador"]}><Bitacora /></RutaProtegida>} />
      </Route>

      {/* Direcciones del panel anterior */}
      <Route path="/panel" element={<Navigate to="/admin" replace />} />
      <Route path="/monitoreo" element={<Navigate to="/admin/servicios" replace />} />
      <Route path="/ordenes/*" element={<Navigate to="/admin/servicios" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
