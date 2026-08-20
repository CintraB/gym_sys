import { Link, useLocation } from "react-router-dom";
import {
  Dumbbell,
  GraduationCap,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { AREAS } from "../auth/areas";
import type { Cargo } from "../types";

// Rota e rótulo vêm de auth/areas, que é a fonte única; aqui fica só o ícone,
// que é assunto de apresentação e não teria por que morar lá.
const ICONES: Record<Cargo, LucideIcon> = {
  admin: ShieldCheck,
  professor: GraduationCap,
  aluno: Dumbbell,
};

/**
 * Leva para as outras áreas a que a pessoa tem acesso.
 *
 * Era um alternador binário, de quando só existiam professor e aluno. Com três
 * áreas possíveis, "o outro lado" deixou de ser uma coisa só. Para quem tem um
 * perfil só, continua não existindo.
 */
export function TrocarArea({ compacto = false }: { compacto?: boolean }) {
  const { usuario } = useAuth();
  const { pathname } = useLocation();

  const destinos = AREAS.filter(
    (area) => usuario?.perfis[area.cargo] && !pathname.startsWith(area.rota),
  );

  if (!usuario || destinos.length === 0) {
    return null;
  }

  if (compacto) {
    return (
      <div className="flex items-center gap-1">
        {destinos.map(({ cargo, rota, rotulo }) => {
          const IconeDaArea = ICONES[cargo];
          return (
            <Link
              key={rota}
              to={rota}
              aria-label={rotulo}
              title={rotulo}
              className="rounded-xl p-2 text-texto-suave transition-colors hover:bg-superficie-2 hover:text-texto"
            >
              <IconeDaArea className="size-5" aria-hidden />
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {destinos.map(({ cargo, rota, rotulo }) => {
        const IconeDaArea = ICONES[cargo];
        return (
          <Link
            key={rota}
            to={rota}
            className="flex items-center gap-2 rounded-xl border border-borda px-3 py-2.5 text-sm text-texto-suave transition-colors hover:border-acento/40 hover:text-texto"
          >
            <IconeDaArea className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{rotulo}</span>
          </Link>
        );
      })}
    </div>
  );
}
