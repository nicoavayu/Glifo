import "./styles.css";
import { createPanelController } from "./panelController";

function getElementByIdOrThrow<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`No se encontró el elemento #${id}`);
  }

  return element as T;
}

function bootstrapPanel() {
  console.info("[PluginSubs] panel boot start");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      console.info("[PluginSubs] panel DOM ready");
      mountController();
    });
    return;
  }

  console.info("[PluginSubs] panel DOM ready");
  mountController();
}

function mountController() {
  try {
    const root = getElementByIdOrThrow<HTMLDivElement>("panelRoot");
    const initialRect = root.getBoundingClientRect();
    console.info("[PluginSubs] panel root found", {
      id: root.id,
      className: root.className,
      childCount: root.childElementCount,
      width: initialRect.width,
      height: initialRect.height,
    });

    const controller = createPanelController({
      root,
    });

    controller.mount();
    console.info("[PluginSubs] panel controller mounted");
  } catch (error) {
    console.error("[PluginSubs] panel boot failed", error);
    throw error;
  }
}

bootstrapPanel();
