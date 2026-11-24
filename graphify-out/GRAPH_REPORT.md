# Graph Report - GruaLink  (2026-11-24)

## Corpus Check
- 159 files · ~101,007 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 5, .service 2, .example 1)

## Summary
- 1034 nodes · 2849 edges · 54 communities (46 shown, 8 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 167 edges (avg confidence: 0.84)
- Token cost: 346,893 input · 0 output

## Community Hubs (Navigation)
- API del panel admin
- Sesión y cliente HTTP
- Acciones del panel admin
- Entorno y scripts BD
- Dependencias frontend
- Despliegue y operación
- Bitácora y catálogos (servicio)
- Rutas de catálogos
- Dependencias backend
- Servicios: controlador
- Turnos del operador
- Órdenes en PDF
- Datos de prueba (seed)
- Plan bolsa SUMA
- App móvil del operador
- Cálculo de tarifas
- Bolsa de km: rutas
- Conexión a PostgreSQL
- Administración de tarifas
- Exportaciones y liquidación
- Rutas de tarifas
- Login y sesiones
- Autenticación y permisos
- Dashboard y reportes
- Validación de servicios
- Gestión de usuarios
- Scripts npm backend
- Arranque y mantenimiento
- Pruebas API operador
- Gestión de grúas
- Validadores login y turno
- Reglas de negocio y permisos
- App Express y errores
- Pruebas API admin
- Análisis de datos y flujos
- Generación de Excel
- Pruebas restricciones BD
- Etapas y arquitectura
- Modelo de datos y problemas
- Script crear-admin
- Instalador en la nube
- Tarifas y migraciones (docs)
- Pago al operador y exportes
- Script de actualización
- Migraciones y pruebas (docs)
- CRUD reutilizable (docs)
- Íconos plantilla Vite
- Favicon
- Ícono Bluesky
- Ícono Discord
- Ícono GitHub
- Ícono X

## God Nodes (most connected - your core abstractions)
1. `mensajeError()` - 56 edges
2. `useCargar()` - 43 edges
3. `@mui/material` - 40 edges
4. `Cargando()` - 40 edges
5. `errorNegocio()` - 39 edges
6. `ErrorCarga()` - 38 edges
7. `react` - 31 edges
8. `@mui/icons-material` - 30 edges
9. `ServicioDetalle()` - 30 edges
10. `pool` - 29 edges

## Surprising Connections (you probably didn't know these)
- `ingresar()` --indirect_call--> `password()`  [INFERRED]
  frontend/src/pages/LoginPage.jsx → backend/routes/usuario.routes.js
- `aprobar()` --indirect_call--> `numero()`  [INFERRED]
  frontend/src/components/admin/DialogosServicio.jsx → backend/services/pdf.service.js
- `guardarProvisional()` --indirect_call--> `clienteId()`  [INFERRED]
  frontend/src/components/admin/BolsaKmTabla.jsx → backend/routes/tarifa.routes.js
- `ejecutar()` --indirect_call--> `clienteId()`  [INFERRED]
  frontend/src/components/admin/BolsaKmTabla.jsx → backend/routes/tarifa.routes.js
- `crear()` --indirect_call--> `clienteId()`  [INFERRED]
  frontend/src/components/admin/BolsaKmTabla.jsx → backend/routes/tarifa.routes.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Cálculo de tarifa, recargo y pago al operador** — docs_etapa_3_backend_seleccion_tarifa, docs_etapa_4_panel_admin_recargo_nocturno, docs_etapa_4_panel_admin_pago_operador, docs_etapa_2_base_de_datos_precios_concepto [INFERRED 0.85]
- **Ciclo de revisión de servicio (corregir, aprobar, reabrir, anular)** — docs_etapa_3_backend_aprobar_corregir_anular, docs_etapa_4_panel_admin_flujo_revision, docs_etapa_4_panel_admin_correccion_completa, docs_etapa_4_panel_admin_reabrir_anular_aprobados, docs_etapa_3_backend_bitacora [INFERRED 0.85]
- **Capas de protección de integridad de datos** — docs_etapa_1_analisis_bd_se_protege_sola, docs_etapa_1_analisis_lista_blanca_campos, docs_etapa_3_backend_serializers_ocultan_valores, docs_etapa_3_backend_tarifas_usadas_inmutables [INFERRED 0.75]
- **Flujo de instalación en VPS** — docs_instalar_en_la_nube_dns_subdominio, docs_instalar_en_la_nube_instalar_sh, docs_instalar_en_la_nube_caddy, docs_instalar_en_la_nube_dos_usuarios_bd [EXTRACTED 1.00]
- **Cálculo de tarifa Suma por bolsa** — docs_plan_suma_bolsa_km_mensual, docs_plan_suma_columna_bolsa, docs_plan_suma_fila_km_servicio, docs_plan_suma_columna_provisional, docs_plan_suma_cierre_mes [EXTRACTED 1.00]
- **Sincronización oficina y casa** — docs_trabajar_en_casa_github, docs_trabajar_en_casa_respaldo_dump, docs_trabajar_en_casa_env_por_equipo, docs_trabajar_en_casa_rutina_oficina_casa [EXTRACTED 1.00]
- **Social and brand logo icons (Bluesky, Discord, GitHub, X)** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_github_icon, frontend_public_icons_x_icon [INFERRED 0.75]
- **SVG sprite of six icon symbols in frontend/public/icons.svg** — frontend_public_icons_bluesky_icon, frontend_public_icons_discord_icon, frontend_public_icons_documentation_icon, frontend_public_icons_github_icon, frontend_public_icons_social_icon, frontend_public_icons_x_icon [EXTRACTED 1.00]

## Communities (54 total, 8 thin omitted)

### Community 0 - "API del panel admin"
Cohesion: 0.05
Nodes (144): actualizarRecurso(), bolsaKmMes(), cambiarPasswordUsuario(), cerrarTurno(), consultarBitacora(), crearRecurso(), dashboardAgrupado(), descargarArchivo() (+136 more)

### Community 1 - "Sesión y cliente HTTP"
Cohesion: 0.06
Nodes (61): login(), logout(), yo(), obtenerCatalogos(), api, crearServicio(), finalizarServicio(), obtenerServicioDetalle() (+53 more)

### Community 2 - "Acciones del panel admin"
Cohesion: 0.08
Nodes (50): camposReglaPago(), clienteId(), actualizarCeldaBolsa(), aprobarServicio(), borrarVigenciaBolsa(), cambiarEstadoGrua(), cambiarEstadoServicio(), cambiarProvisionalBolsa() (+42 more)

### Community 3 - "Entorno y scripts BD"
Cohesion: 0.06
Nodes (29): esProduccion(), fs, leerEntorno(), path, fs, path, aplicarPermisos(), { Client } (+21 more)

### Community 4 - "Dependencias frontend"
Cohesion: 0.06
Nodes (41): dependencies, axios@^1.21.0, @emotion/react@^11.14.0, @emotion/styled@^11.14.1, @mui/icons-material@^9.5.0, @mui/material@^9.5.0, react@^19.3.1, react-dom@^19.3.1 (+33 more)

### Community 5 - "Despliegue y operación"
Cohesion: 0.08
Nodes (39): Procedimiento de actualizar a versión nueva, Endpoint GET /api/salud, Script crear-admin (primer administrador), Comando datos-iniciales (catálogos y tarifas), GruaLink Etapa 7: Preparación para producción, Validación de entorno al arrancar, Limpieza horaria de sesiones vencidas, Lista de verificación antes de abrir a operadores (+31 more)

### Community 6 - "Bitácora y catálogos (servicio)"
Cohesion: 0.12
Nodes (21): BitacoraModel, UsuarioModel, crearServicioCatalogo(), ClienteService, ConceptoService, TipoServicioService, TipoVehiculoService, validarCambioConcepto() (+13 more)

### Community 7 - "Rutas de catálogos"
Cohesion: 0.13
Nodes (25): clientes, conceptos, { Router }, routerCatalogo(), tiposServicio, tiposVehiculo, crearRouter(), { body } (+17 more)

### Community 8 - "Dependencias backend"
Cohesion: 0.10
Nodes (25): author, dependencies, bcrypt@^6.0.0, dotenv@^18.0.9, express@^5.3.0, express-rate-limit@^8.7.1, express-validator@^7.3.2, helmet@^8.3.0 (+17 more)

### Community 9 - "Servicios: controlador"
Cohesion: 0.18
Nodes (20): aprobar(), cambiarEstado(), corregir(), crear(), detalle(), finalizar(), listar(), tienePermiso() (+12 more)

### Community 10 - "Turnos del operador"
Cohesion: 0.11
Nodes (11): listar(), GruaModel, COLUMNAS_APROBAR, COLUMNAS_CORREGIR, COLUMNAS_CREAR, COLUMNAS_FINALIZAR, COLUMNAS_VALORES, ESTADOS_ABIERTOS (+3 more)

### Community 11 - "Órdenes en PDF"
Cohesion: 0.20
Nodes (23): enviarOrdenes(), ahoraBogota(), bloqueTexto(), crearOrdenesPdf(), duracion(), encabezado(), ESTADOS, fechaHora() (+15 more)

### Community 12 - "Datos de prueba (seed)"
Cohesion: 0.13
Nodes (23): bcrypt, BOLSA_SUMA, CLIENTES, CONCEPTOS, crearBolsaSuma(), crearCatalogosBase(), crearConceptos(), crearPrecio() (+15 more)

### Community 13 - "Plan bolsa SUMA"
Cohesion: 0.15
Nodes (23): Los aprobados conservan su valor, Bitácora de cambios, Modalidad de cobro bolsa de km mensual, calcularPorBolsa en tarifa.service.js, Cierre de mes y recálculo (cerrarMesesPendientes), Columna elegida por la bolsa del mes, Columna provisional del mes abierto, Decisiones provisionales de Suma (+15 more)

### Community 14 - "App móvil del operador"
Cohesion: 0.10
Nodes (21): App móvil del operador (/app), Borrador automático del formulario de servicio, Cambios pedidos por SOTRANDES (migración 007), GruaLink Etapa 5: App móvil del operador, Entornos desarrollo y pruebas (puertos 4000/4001, 5173/5180), Pantalla Finalizar servicio, Regla MUI 9: estilos dentro de sx, Pantalla Nuevo servicio (4 pasos) (+13 more)

### Community 15 - "Cálculo de tarifas"
Cohesion: 0.21
Nodes (15): CatalogosModel, TarifaModel, etiquetaProvisional(), resumenMes(), aplicarRecargoNocturno(), BOLSA_PROVISIONAL, calcularConceptos(), calcularPorBolsa() (+7 more)

### Community 16 - "Bolsa de km: rutas"
Cohesion: 0.22
Nodes (15): withTransaction(), { query, body, param }, { Router }, esBolsa(), recalcularMes(), actualizarCelda(), borrarVigencia(), cambiarProvisional() (+7 more)

### Community 17 - "Conexión a PostgreSQL"
Cohesion: 0.18
Nodes (11): pool, { Pool, types }, urlDeConexion(), ClienteModel, ConceptoModel, TipoServicioModel, TipoVehiculoModel, crearModeloCrud() (+3 more)

### Community 18 - "Administración de tarifas"
Cohesion: 0.16
Nodes (15): eliminar(), listarConVigencia(), PrecioConceptoModel, ReglaPagoModel, TarifaAdminModel, crearServicioVersionado(), IGNORAR, PrecioConceptoService (+7 more)

### Community 19 - "Exportaciones y liquidación"
Cohesion: 0.12
Nodes (12): COMPONENTES_PAGO, ESTADOS, ESTADOS_TURNO, filtrosValidos, FORMAS_BOLSA, { query, param }, { Router }, UNIDADES (+4 more)

### Community 20 - "Rutas de tarifas"
Cohesion: 0.16
Nodes (15): { body, query }, camposPrecio(), camposTarifa(), COMPONENTES, filtrosListado, FORMAS, horaNulable(), kmNulable (+7 more)

### Community 21 - "Login y sesiones"
Cohesion: 0.20
Nodes (11): bcrypt, crypto, HASH_FALSO, login(), logout(), TTL_HORAS, usuarioPublico(), yo() (+3 more)

### Community 22 - "Autenticación y permisos"
Cohesion: 0.24
Nodes (9): obtenerCatalogos(), autenticar(), requierePermiso(), { Router }, { Router }, puedeVer, { Router }, { Router } (+1 more)

### Community 23 - "Dashboard y reportes"
Cohesion: 0.15
Nodes (9): DashboardModel, filtrosServicios(), ExportarModel, bitacora, dashboard, ESTADOS, filtrosValidos, { query, param } (+1 more)

### Community 24 - "Validación de servicios"
Cohesion: 0.14
Nodes (9): { body, param, query }, ESTADOS, validarAprobar, validarCambioEstado, validarCorregir, validarCrearServicio, validarFinalizarServicio, validarId (+1 more)

### Community 25 - "Gestión de usuarios"
Cohesion: 0.17
Nodes (7): crearControladorCatalogo(), { body }, ctrl, password(), ROLES, { Router }, UsuarioService

### Community 26 - "Scripts npm backend"
Cohesion: 0.17
Nodes (12): scripts, crear-admin, crear-usuario-app, datos-iniciales, dev, migrate, respaldo, restaurar (+4 more)

### Community 27 - "Arranque y mantenimiento"
Cohesion: 0.24
Nodes (10): apagar(), app, detenerMantenimiento, { errores, avisos, config }, servidor, cerrarMesesPendientes(), cerrarMesesBolsaKm(), iniciarMantenimiento() (+2 more)

### Community 28 - "Pruebas API operador"
Cohesion: 0.21
Nodes (9): api(), assert, datosFinalizar(), datosServicio(), haceMinutos(), ids, login(), { test, before, after } (+1 more)

### Community 29 - "Gestión de grúas"
Cohesion: 0.20
Nodes (8): { body }, camposGrua(), ctrl, gestionar, placa(), { Router }, ver, GruaService

### Community 30 - "Validadores login y turno"
Cohesion: 0.18
Nodes (8): { body }, validarLogin, { body, param, query }, validarCerrarTurnoAdmin, validarFinalizarTurno, validarIniciarTurno, validarListado, express-validator

### Community 31 - "Reglas de negocio y permisos"
Cohesion: 0.20
Nodes (11): Flujo de trabajo del administrador, Matriz de permisos por rol, Recargo nocturno: columnas y horario (migraciones 009 y 012), Aprobar, corregir y anular servicios con motivo y bitácora, Bitácora de auditoría, Reglas de negocio implementadas (servidor decide, turno obligatorio, finalizar una vez), Serializers: el operador no ve valores en pesos, Corrección completa del servicio (+3 more)

### Community 32 - "App Express y errores"
Cohesion: 0.31
Nodes (8): crearApp(), express, helmet, path, rateLimit, ERRORES_PG, errorHandler(), RESTRICCIONES

### Community 33 - "Pruebas API admin"
Cohesion: 0.22
Nodes (7): api(), assert, ids, login(), SUFIJO, { test, before, after }, tk

### Community 34 - "Análisis de datos y flujos"
Cohesion: 0.22
Nodes (9): Calidad de datos del Excel (texto libre, duplicados, 7.587 servicios), Excel REGISTRO TOTAL SERVICIOS DE GRUAS VIGENTE, Exclusión de rangos superpuestos en tarifas (btree_gist), Flujo del operador (celular), Tarifas reales: cliente + concepto + cobertura + operación + vigencia, Tabla turnos_operador, Hallazgos del Excel y decisiones de diseño, Endpoints de auth, turnos, servicios y catálogos (+1 more)

### Community 35 - "Generación de Excel"
Cohesion: 0.31
Nodes (8): exceljs@4.4.0, aFechaExcel(), convertir(), crearExcel(), ExcelJS, FORMATOS, letra(), exceljs

### Community 36 - "Pruebas restricciones BD"
Cohesion: 0.22
Nodes (3): assert, ERROR, { test, after }

### Community 37 - "Etapas y arquitectura"
Cohesion: 0.33
Nodes (8): Etapa 1: Análisis y arquitectura, Arquitectura propuesta (React + Express MVC + PostgreSQL), Plan de desarrollo priorizado (Etapas 0-7), Etapa 2: Base de datos (PostgreSQL), Etapa 3: Backend, Capas MVC: routes, middlewares, validators, controllers, services, models, views, Etapa 4: Panel administrativo, Menú y rutas de /admin

### Community 38 - "Modelo de datos y problemas"
Cohesion: 0.22
Nodes (8): Tabla asignaciones_grua (propuesta), Diagrama entidad-relación actualizado, Estados de grúa/operador mezclados con servicios, Tabla gruas_estado_historial, Preguntas abiertas P1-P21, Problemas encontrados en el código existente (13 hallazgos), Dashboard con SQL agregado y promedio de grúas, Reglas provisionales (P3, P8, P9, P10, P12, P13)

### Community 39 - "Script crear-admin"
Cohesion: 0.32
Nodes (7): bcrypt, claveValida(), cola, main(), preguntar(), readline, rl

### Community 40 - "Instalador en la nube"
Cohesion: 0.39
Nodes (7): clave_aleatoria(), como_app(), DEBIAN_FRONTEND, falla(), NEEDRESTART_MODE, paso(), instalar.sh script

### Community 41 - "Tarifas y migraciones (docs)"
Cohesion: 0.29
Nodes (6): Cobro por bolsa de km mensual (Suma), Migraciones 000 a 013 aplicadas, Tabla precios_concepto (precio por cliente y vigencia), Tarifas 2026 (PLANES_2026 y npm run datos-iniciales), Tabla tipos_servicio, Selección de tarifa: cliente primero, luego clientes generales, ambigua es error

### Community 42 - "Pago al operador y exportes"
Cohesion: 0.33
Nodes (6): Fórmula del porcentaje del operador (6% / 8% + $20.000 cardán), Tabla reglas_pago_operador, Exportar a Excel (ExcelJS), Órdenes de servicio en PDF (PDFKit), Pago al operador (reglas configurables), Exportación de tarifas a Excel (4 hojas)

### Community 43 - "Script de actualización"
Cohesion: 0.83
Nodes (3): como_app(), paso(), actualizar.sh script

### Community 44 - "Migraciones y pruebas (docs)"
Cohesion: 0.50
Nodes (3): Migraciones numeradas (npm run migrate, schema_migrations), Comandos migrate, seed y test, Pruebas sobre base aparte GruaLink_test

### Community 45 - "CRUD reutilizable (docs)"
Cohesion: 0.50
Nodes (3): Endpoints del administrador, Piezas CRUD reutilizables (crearModeloCrud, crearServicioCatalogo, crearControladorCatalogo), Componente CrudCatalogo

## Knowledge Gaps
- **44 isolated node(s):** `DEBIAN_FRONTEND`, `NEEDRESTART_MODE`, `Calidad de datos del Excel (texto libre, duplicados, 7.587 servicios)`, `Tabla tipos_servicio`, `Cobro por bolsa de km mensual (Suma)` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 316 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `clienteId()` connect `Acciones del panel admin` to `Rutas de tarifas`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **What connects `DEBIAN_FRONTEND`, `NEEDRESTART_MODE`, `Calidad de datos del Excel (texto libre, duplicados, 7.587 servicios)` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API del panel admin` be split into smaller, more focused modules?**
  _Cohesion score 0.053763440860215055 - nodes in this community are weakly interconnected._
- **Why does `mensajeError()` connect `Acciones del panel admin` to `API del panel admin`, `Sesión y cliente HTTP`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Should `Sesión y cliente HTTP` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Why does `numero()` connect `Órdenes en PDF` to `Acciones del panel admin`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Should `Acciones del panel admin` be split into smaller, more focused modules?**
  _Cohesion score 0.08295625942684766 - nodes in this community are weakly interconnected._