import { WebContainer } from "@webcontainer/api";

let instance: WebContainer | null = null;
let booting: Promise<WebContainer> | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;

  if (booting) return booting;

  booting = WebContainer.boot().then((wc) => {
    instance = wc;
    booting = null;
    return wc;
  });

  return booting;
}

export function getWebContainerInstance(): WebContainer | null {
  return instance;
}
