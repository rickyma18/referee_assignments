import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "../_components/login-form";
import { GoogleButton } from "../_components/social-auth/google-button";

export default function LoginV1() {
  return (
    <div className="flex h-dvh">
      <div className="bg-primary hidden lg:block lg:w-1/3">
        <div className="flex h-full flex-col items-center justify-center p-12 text-center">
          <div className="space-y-6">
            <Image src="/media/FMF_Logo.png" alt="Logo" width={100} height={100} className="mx-auto" />

            <div className="space-y-2">
              <h1 className="text-primary-foreground text-5xl font-light">Hola de nuevo!</h1>
              <p className="text-primary-foreground/80 text-xl">Inicia sesión para comenzar</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-background flex w-full items-center justify-center p-8 lg:w-2/3">
        <div className="w-full max-w-md space-y-10 py-24 lg:py-32">
          <div className="space-y-4 text-center">
            <div className="font-medium tracking-tight">Inicia sesión</div>
          </div>
          <div className="space-y-4">
            <LoginForm />
            <GoogleButton className="w-full" variant="outline" />
            <p className="text-muted-foreground text-center text-xs">
              No tienes una cuenta?{" "}
              <Link href="register" className="text-primary">
                Regístrate
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
