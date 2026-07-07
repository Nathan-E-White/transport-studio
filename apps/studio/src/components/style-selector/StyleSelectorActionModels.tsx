

import type {StylePackID} from "@transport/frontend";

export type StyleSelectorAction =
    | {
          type: "set-active-pack";
          packID: StylePackID;
      }
    | {
          type: "reset-active-pack";
      };
