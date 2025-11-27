// src/app/help/page.tsx
import Link from "next/link";

import {
  BookOpen,
  HelpCircle,
  Keyboard,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Search,
  Shield,
  Sparkles,
  UserCircle2,
  Info,
  Trophy,
} from "lucide-react";
import { FaUniversity, FaRegIdCard } from "react-icons/fa";
import { GiWhistle } from "react-icons/gi";

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

export default function HelpPage() {
  return (
    <div className="container max-w-5xl space-y-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-muted-foreground inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs">
            <HelpCircle className="h-3 w-3" />
            Centro de ayuda
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">¿En qué te ayudamos hoy?</h1>
          <p className="text-muted-foreground max-w-xl text-sm">
            Aquí encontrarás atajos rápidos, preguntas frecuentes y formas de contactar al administrador del sistema de
            designaciones.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild size="sm">
            <Link href="/dashboard/assignments">
              <GiWhistle className="mr-2 h-4 w-4" />
              Ir a Designaciones
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/dashboard/teams-explorer">
              <FaUniversity className="mr-2 h-4 w-4" />
              Explorar Ligas / Grupos / Equipos
            </Link>
          </Button>
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)]">
        {/* Columna izquierda */}
        <div className="space-y-6">
          {/* Cómo usar el sistema */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-sm font-medium">Guía rápida del sistema</CardTitle>
                <p className="text-muted-foreground mt-1 text-xs">
                  Un resumen de las secciones más importantes y qué puedes hacer en cada una.
                </p>
              </div>
              <Sparkles className="text-muted-foreground h-5 w-5" />
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <GiWhistle className="h-4 w-4" />
                  <span>Designaciones</span>
                </div>
                <p className="text-muted-foreground">
                  Aquí trabajas el día a día: ves los partidos próximos, generas ternas sugeridas, editas árbitros por
                  partido y confirmas las designaciones que se guardan en la base.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <FaRegIdCard className="h-4 w-4" />
                  <span>Árbitros y Asesores</span>
                </div>
                <p className="text-muted-foreground">
                  Módulo para gestionar el padrón de árbitros: altas, edición, importación desde Excel, ajustes de RCS,
                  etc.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <FaUniversity className="h-4 w-4" />
                  <span>Ligas, grupos y equipos</span>
                </div>
                <p className="text-muted-foreground">
                  Estructura competitiva: creación de ligas, configuración de grupos y carga de equipos. Desde aquí se
                  alimentan los partidos que verás en el módulo de designaciones.
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Trophy className="h-4 w-4" />
                  <span>Tier lists y control técnico</span>
                </div>
                <p className="text-muted-foreground">
                  Vistas de análisis para clasificar árbitros y equipos por nivel. Útil para supervisión, castigos,
                  proyecciones y planeación de jornadas clave.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* FAQ / Preguntas frecuentes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-sm font-medium">Preguntas frecuentes</CardTitle>
                <p className="text-muted-foreground mt-1 text-xs">
                  Respuestas rápidas a las dudas típicas de delegados y árbitros.
                </p>
              </div>
              <BookOpen className="text-muted-foreground h-5 w-5" />
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="q1">
                  <AccordionTrigger className="text-sm">
                    No me aparecen todos los partidos en Designaciones, ¿por qué?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm">
                    La vista principal de designaciones muestra por defecto solo los partidos{" "}
                    <span className="font-semibold">próximos</span>. Si quieres ver jornadas pasadas o un rango
                    específico, usa los filtros de fecha (&quot;Desde&quot; / &quot;Hasta&quot;) en la parte superior de
                    la tabla.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="q2">
                  <AccordionTrigger className="text-sm">
                    ¿Qué pasa cuando doy &quot;Confirmar todas las ternas&quot;?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm">
                    Solo se guardan en la base de datos los partidos que:
                    <br />
                    <br />
                    <ul className="ml-4 list-disc space-y-1">
                      <li>Tienen terna completa (central, AA1 y AA2).</li>
                      <li>Cambiaron en el UI respecto a lo que venía desde el servidor.</li>
                    </ul>
                    El resto se mantiene igual. Siempre puedes refrescar la página para validar los cambios.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="q3">
                  <AccordionTrigger className="text-sm">
                    ¿Cómo controlo la regla de 4 jornadas con un equipo?
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm">
                    Desde el perfil de cada árbitro verás un resumen de partidos recientes y un conteo por equipo. Si
                    detectas que un equipo se repite demasiado con ese árbitro, puedes ajustar las próximas
                    designaciones.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="q4">
                  <AccordionTrigger className="text-sm">Soy árbitro, ¿qué puedo ver y qué no?</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm">
                    El rol <span className="font-semibold">ÁRBITRO</span> tiene acceso principalmente a:
                    <br />
                    <br />
                    <ul className="ml-4 list-disc space-y-1">
                      <li>Sus propias designaciones y calendario.</li>
                      <li>
                        Vistas de liga/grupos/equipos en modo lectura, según cómo lo haya configurado el administrador.
                      </li>
                    </ul>
                    No puede editar terna, crear ligas ni modificar árbitros.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          {/* Atajos y búsqueda */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Atajos y búsqueda rápida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Search className="text-muted-foreground h-4 w-4" />
                  <div>
                    <p className="text-xs font-medium">Búsqueda global</p>
                    <p className="text-muted-foreground text-[11px]">
                      Abre el buscador de ligas, árbitros, equipos y pantallas clave.
                    </p>
                  </div>
                </div>
                <kbd className="bg-muted inline-flex h-6 items-center gap-1 rounded border px-1.5 text-[10px] font-medium select-none">
                  <span className="text-xs">⌘</span>J
                </kbd>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <Keyboard className="text-muted-foreground h-4 w-4" />
                  <div>
                    <p className="text-xs font-medium">Navegación principal</p>
                    <p className="text-muted-foreground text-[11px]">
                      Usa el sidebar para cambiar entre Designaciones, Árbitros, Ligas y Tiers sin perder el contexto.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-md px-3 py-2 text-[11px]">
                <Info className="h-3.5 w-3.5" />
                <p>
                  Si algo no se actualiza después de un cambio grande (importar Excel, recalcular ternas, etc.), prueba
                  con <span className="font-medium">refresh de la página</span>.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Perfil y soporte */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Soporte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <UserCircle2 className="text-muted-foreground h-8 w-8" />
                <div>
                  <p className="text-xs font-medium">Revisa primero tu perfil</p>
                  <p className="text-muted-foreground text-[11px]">
                    Verifica que tu rol, nombre y datos de contacto sean correctos.
                  </p>
                  <Button variant="link" size="sm" className="!px-0" asChild>
                    <Link href="/dashboard/account">Ir a mi perfil</Link>
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium">¿Sigue sin funcionar?</p>
                <p className="text-muted-foreground text-[11px]">
                  Si encontraste un bug, algo no carga o quieres proponer una mejora, manda mensaje al administrador del
                  sistema.
                </p>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="text-muted-foreground h-4 w-4" />
                    <span>WhatsApp / Mensaje directo</span>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
                    <span>Incluye captura de pantalla, URL de la página y lo que estabas intentando hacer.</span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Mail className="text-muted-foreground h-4 w-4" />
                    <span>Correo de soporte</span>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    {/* Cambia esto por tu correo real de soporte */}
                    ricardomurillo.udg@gmail.com{" "}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="bg-muted/40 text-muted-foreground flex items-center gap-2 rounded-md px-3 py-2 text-[11px]">
                <Shield className="h-3.5 w-3.5" />
                <p>
                  Los accesos y permisos dependen de tu rol. Si necesitas ver o editar algo y no te aparece,
                  probablemente sea un tema de permisos, no un error.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
