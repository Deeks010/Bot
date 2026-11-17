import React from "react";
import { Composition } from "remotion";
import { TitanicShort, TITANIC_FRAMES } from "./videos/titanic/Titanic";

export const Root: React.FC = () => (
  <>
    <Composition id="TitanicShort" component={TitanicShort} durationInFrames={TITANIC_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
