import React, { useState, useImperativeHandle, useCallback, useRef, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@excalidraw/excalidraw/index.css';
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToSvg,
  exportToBlob,
  serializeAsJSON,
  restore,
  convertToExcalidrawElements,
  getSceneVersion,
  CaptureUpdateAction,
  THEME,
} from '@excalidraw/excalidraw';

const ExcalidrawHost = forwardRef(function ExcalidrawHost(
  { initialData, initialTheme = 'light', initialLangCode = 'en', initialViewMode = false, onChange, onReady },
  ref,
) {
  const [theme, setTheme] = useState(initialTheme);
  const [langCode, setLangCode] = useState(initialLangCode);
  const [viewModeEnabled, setViewModeEnabled] = useState(initialViewMode);
  const apiCalledRef = useRef(false);

  useImperativeHandle(ref, () => ({
    setTheme: next => setTheme(next === 'dark' ? 'dark' : 'light'),
    setLangCode: next => setLangCode(next || 'en'),
    setViewMode: next => setViewModeEnabled(Boolean(next)),
  }), []);

  const handleApi = useCallback(api => {
    if (!api || apiCalledRef.current) return;
    apiCalledRef.current = true;
    if (onReady) onReady(api);
  }, [onReady]);

  return (
    <Excalidraw
      initialData={initialData}
      theme={theme}
      langCode={langCode}
      viewModeEnabled={viewModeEnabled}
      onChange={onChange}
      excalidrawAPI={handleApi}
      UIOptions={{
        canvasActions: {
          changeViewBackgroundColor: true,
          clearCanvas: true,
          export: false,
          loadScene: false,
          saveAsImage: false,
          saveToActiveFile: false,
          toggleTheme: false,
        },
      }}
    >
      <MainMenu>
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.CommandPalette />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint />
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.HelpHint />
      </WelcomeScreen>
    </Excalidraw>
  );
});

export function mountExcalidraw(container, options = {}) {
  const hostRef = React.createRef();
  let apiRef = null;
  const root = createRoot(container);

  root.render(
    <ExcalidrawHost
      ref={hostRef}
      initialData={options.initialData}
      initialTheme={options.theme || 'light'}
      initialLangCode={options.langCode || 'en'}
      initialViewMode={Boolean(options.viewModeEnabled)}
      onChange={options.onChange}
      onReady={api => {
        apiRef = api;
        if (options.onReady) options.onReady(api);
      }}
    />,
  );

  return {
    getAPI: () => apiRef,
    setTheme: next => hostRef.current?.setTheme(next),
    setLangCode: next => hostRef.current?.setLangCode(next),
    setViewMode: next => hostRef.current?.setViewMode(next),
    unmount: () => root.unmount(),
  };
}

export {
  exportToSvg,
  exportToBlob,
  serializeAsJSON,
  restore,
  convertToExcalidrawElements,
  getSceneVersion,
  CaptureUpdateAction,
  THEME,
};
