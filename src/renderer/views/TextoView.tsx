import { ProjectSetup } from "../components/ProjectSetup";

/** Vista Texto: título, texto litúrgico, silabificação e seções. */
export function TextoView() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ProjectSetup />
    </div>
  );
}
