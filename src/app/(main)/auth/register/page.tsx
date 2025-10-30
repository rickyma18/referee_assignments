import Image from "next/image";
import Link from "next/link";

import { RegisterForm } from "../_components/register-form";
import { GoogleButton } from "../_components/social-auth/google-button";

export default function RegisterV1() {
  return (
    <div className="flex h-dvh">
      <div className="bg-background flex w-full items-center justify-center p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <div className="font-medium tracking-tight">Regístrate</div>
            <div className="text-muted-foreground mx-auto max-w-xl">Ingresa tus datos para crear tu cuenta.</div>
          </div>
          <div className="space-y-4">
            <RegisterForm />
            <GoogleButton className="w-full" variant="outline" />
            <p className="text-muted-foreground text-center text-xs">
              Ya tienes una cuenta?{" "}
              <Link href="login" className="text-primary">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Panel lateral con el logo */}
      <div className="bg-primary hidden lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-6">
            {/* Logo centrado */}
            <Image src="/media/FMF_Logo.png" alt="Logo" width={100} height={100} className="mx-auto" />
            <div className="space-y-2">
              <h1 className="text-primary-foreground text-5xl font-light">¡Bienvenido!</h1>
              <p className="text-primary-foreground/80 text-xl">Estás en el lugar correcto para comenzar.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
