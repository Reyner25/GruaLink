/**
 * Barra de filtros del panel: fechas, cliente, grúa, operador y estado.
 * Se usa junto con el hook useFiltrosUrl (hooks/useFiltrosUrl.js), que guarda
 * los filtros en la URL.
 */
import { useEffect, useState } from "react";
import { Button, Card, CardContent, MenuItem, Stack, TextField } from "@mui/material";
import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import { obtenerCatalogos } from "../../api/catalogos.api";
import { listarUsuarios } from "../../api/admin.api";
import { ESTADOS_SERVICIO } from "../../utils/formato";

export default function Filtros({ filtros, cambiar, limpiar, ocultar = [] }) {
  const [listas, setListas] = useState({ clientes: [], gruas: [], operadores: [] });

  useEffect(() => {
    let vigente = true;
    obtenerCatalogos()
      .then((c) => vigente && setListas((l) => ({ ...l, clientes: c.clientes, gruas: c.gruas })))
      .catch(() => {});
    // El financiero no puede listar usuarios: en ese caso el filtro de operador no aparece
    listarUsuarios({ limite: 500 })
      .then((u) => vigente && setListas((l) => ({ ...l, operadores: u.filter((x) => x.rol === "operador") })))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const select = (campo, etiqueta, opciones) =>
    !ocultar.includes(campo) && (
      <TextField
        select
        size="small"
        label={etiqueta}
        value={filtros[campo]}
        onChange={(e) => cambiar(campo, e.target.value)}
        sx={{ minWidth: 170 }}
      >
        <MenuItem value="">Todos</MenuItem>
        {opciones.map((o) => (
          <MenuItem key={o.valor} value={String(o.valor)}>
            {o.texto}
          </MenuItem>
        ))}
      </TextField>
    );

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
          <TextField
            size="small"
            type="date"
            label="Desde"
            value={filtros.desde}
            onChange={(e) => cambiar("desde", e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 165 }}
          />
          <TextField
            size="small"
            type="date"
            label="Hasta"
            value={filtros.hasta}
            onChange={(e) => cambiar("hasta", e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 165 }}
          />
          {select("cliente_id", "Cliente", listas.clientes.map((c) => ({ valor: c.id, texto: c.nombre })))}
          {select("grua_id", "Grúa", listas.gruas.map((g) => ({ valor: g.id, texto: `${g.numero_interno} · ${g.placa}` })))}
          {listas.operadores.length > 0 &&
            select("operador_id", "Operador", listas.operadores.map((u) => ({ valor: u.id, texto: u.nombre })))}
          {select("estado", "Estado", Object.entries(ESTADOS_SERVICIO).map(([valor, e]) => ({ valor, texto: e.texto })))}
          <Button startIcon={<FilterAltOffIcon />} onClick={limpiar} color="inherit">
            Limpiar
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
