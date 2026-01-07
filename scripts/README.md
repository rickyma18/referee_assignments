# Scripts de Administración

## set-custom-claims.ts

Script para administrar Custom Claims de Firebase Auth.

### Requisitos

- Credenciales de Firebase Admin configuradas en `.env.local`:
  - `GOOGLE_APPLICATION_CREDENTIALS` (ruta al archivo JSON), o
  - `GOOGLE_CLOUD_CREDENTIALS_JSON` (JSON inline)

### Uso

```bash
# Vía npm script
npm run claims -- <command> <uid> [args...]

# O directamente
npx tsx scripts/set-custom-claims.ts <command> <uid> [args...]
```

### Comandos

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `get <uid>` | Mostrar claims actuales | `npm run claims -- get abc123` |
| `set-role <uid> <role>` | Setear solo role | `npm run claims -- set-role abc123 DELEGADO` |
| `set-delegate <uid> <delegateId>` | Setear solo delegateId | `npm run claims -- set-delegate abc123 del_xyz` |
| `set-both <uid> <role> <delegateId>` | Setear role y delegateId | `npm run claims -- set-both abc123 DELEGADO del_xyz` |
| `clear <uid>` | Limpiar todos los claims | `npm run claims -- clear abc123` |

### Roles válidos

- `SUPERUSUARIO` - Acceso total, puede ver/editar datos de todos los delegados
- `DELEGADO` - Acceso a sus propios datos (requiere delegateId)
- `ASISTENTE` - Lectura de datos del delegado asignado
- `ARBITRO` - Acceso mínimo

### Ejemplo de flujo

```bash
# 1. Ver claims actuales de un usuario
npm run claims -- get abc123

# 2. Asignar rol de DELEGADO con su delegateId
npm run claims -- set-both abc123 DELEGADO del_abc123

# 3. Verificar que se aplicó correctamente
npm run claims -- get abc123
```

### Notas

- Los claims se propagan automáticamente a Firebase Auth
- El script también sincroniza con el documento `/users/{uid}` en Firestore
- Los cambios de claims pueden tardar hasta 1 hora en reflejarse en tokens existentes
- Para forzar actualización inmediata, el usuario debe cerrar sesión y volver a iniciar

### Server Actions alternativa

También existen server actions protegidas para SUPERUSUARIO:

- `getUserClaimsAction(uid)` - Obtener claims
- `setUserRoleClaimAction({ uid, role })` - Setear role
- `setUserDelegateIdClaimAction({ uid, delegateId })` - Setear delegateId
- `setUserClaimsAction({ uid, role, delegateId? })` - Setear ambos
- `clearUserClaimsAction(uid)` - Limpiar claims

Ubicación: `src/server/actions/admin-claims.actions.ts`

---

## migrate-add-delegate-id.ts

Script para migrar documentos legacy agregando `delegateId` para multi-tenant.

### Características

- **DRY-RUN por defecto**: No modifica datos a menos que uses `--apply`
- **Idempotente**: Ejecutar múltiples veces no causa problemas
- **Nunca sobrescribe**: Si un doc ya tiene `delegateId`, no lo modifica
- **Reporta conflictos**: Muestra docs con `delegateId` diferente

### Uso

```bash
npm run migrate-delegate -- <command> [args...]
```

### Comandos

| Comando | Descripción |
|---------|-------------|
| `dry-run-leagues` | Lista leagues sin delegateId (preview) |
| `apply-leagues` | Actualiza leagues sin delegateId |
| `propagate-teams` | Propaga delegateId a teams via su grupo/league |
| `propagate-venues` | Propaga delegateId a venues via leagueId/groupId |
| `assign-referees` | Asigna delegateId a referees específicos |
| `report` | Muestra estadísticas de migración |

### Flujo recomendado de migración

```bash
# 1. Ver estado actual
npm run migrate-delegate -- report --delegate del_abc123

# 2. Migrar leagues (primero dry-run)
npm run migrate-delegate -- dry-run-leagues --delegate del_abc123 --limit 5
npm run migrate-delegate -- apply-leagues --delegate del_abc123

# 3. Propagar a teams (primero dry-run)
npm run migrate-delegate -- propagate-teams --delegate del_abc123
npm run migrate-delegate -- propagate-teams --delegate del_abc123 --apply

# 4. Propagar a venues (primero dry-run)
npm run migrate-delegate -- propagate-venues --delegate del_abc123
npm run migrate-delegate -- propagate-venues --delegate del_abc123 --apply

# 5. Asignar referees manualmente
npm run migrate-delegate -- assign-referees --delegate del_abc123 --query "garcia"
npm run migrate-delegate -- assign-referees --delegate del_abc123 --ids ref1,ref2,ref3 --apply

# 6. Verificar resultado final
npm run migrate-delegate -- report --delegate del_abc123
```

### Ejemplos detallados

```bash
# Listar leagues sin delegateId que coinciden con "premier"
npm run migrate-delegate -- dry-run-leagues --delegate del_abc --query "premier" --limit 10

# Aplicar delegateId a leagues que coinciden
npm run migrate-delegate -- apply-leagues --delegate del_abc --query "premier"

# Ver qué teams se actualizarían
npm run migrate-delegate -- propagate-teams --delegate del_abc

# Ejecutar la propagación de teams
npm run migrate-delegate -- propagate-teams --delegate del_abc --apply

# Buscar referees por nombre (dry-run)
npm run migrate-delegate -- assign-referees --delegate del_abc --query "martinez"

# Asignar referees específicos por ID
npm run migrate-delegate -- assign-referees --delegate del_abc --ids ref1,ref2 --apply
```

### Notas importantes

- **Herencia**: `groups`, `matchdays`, `matches` heredan delegateId via su league padre (no se migran directamente)
- **Zones**: No se migran (catálogo global compartido)
- **Referees**: No tienen relación automática con leagues, se asignan manualmente
- **Conflictos**: Si un doc tiene `delegateId` diferente, se reporta pero no se modifica

---

## seed-delegates.ts

Script para poblar la colección `/delegates` con el catálogo inicial de delegaciones.

### Requisitos

- Credenciales de Firebase Admin configuradas (igual que `set-custom-claims.ts`)

### Uso

```bash
npx tsx scripts/seed-delegates.ts
```

### Comportamiento

- **Idempotente**: Si un documento ya existe, no lo sobrescribe
- **No automático**: Debe ejecutarse manualmente
- Crea los siguientes documentos:

| ID | Nombre | Orden |
|----|--------|-------|
| `del_jalisco` | Jalisco | 1 |
| `del_bc` | Baja California | 2 |
| `del_cdmx` | Ciudad de México | 3 |
| `del_nuevo_leon` | Nuevo León | 4 |
| `del_guanajuato` | Guanajuato | 5 |

### Alternativa: Firestore Console

También puedes crear los documentos manualmente en la [Firestore Console](https://console.firebase.google.com):

1. Navega a Firestore Database
2. Crea colección `delegates`
3. Para cada delegación, crea un documento con:
   - **Document ID**: `del_jalisco`, `del_bc`, etc.
   - **Campos**:
     - `name` (string): "Jalisco"
     - `isActive` (boolean): true
     - `order` (number): 1, 2, 3...

