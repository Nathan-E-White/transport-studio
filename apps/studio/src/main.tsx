import React from "react";
import ReactDOM from "react-dom/client";
import {defaultPack, stylePacks} from "@transport/frontend/styles/packs";
import { StudioApp } from "./app/StudioApp";
import {StyleSelectorScope} from "./components/style-selector/StyleSelectorScope";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StyleSelectorScope defaultPackID={defaultPack.id} packs={stylePacks}>
      <StudioApp />
    </StyleSelectorScope>
  </React.StrictMode>
);
