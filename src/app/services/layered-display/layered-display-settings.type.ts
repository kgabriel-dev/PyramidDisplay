export type LayeredDisplaySettings = {
    generalSettings: LayeredDisplayGeneralSettings;
    fileSettings: LayeredDisplayFileSettings[];
}

export type LayeredDisplayGeneralSettings = {
    numberOfLayers: number;
}

export type LayeredDisplayFileSettings = {
    fileName: string;
    mimeType: string;
    unique_id: string;
    metaData: {[key in MetaDataKeys]?: any};
    scalingFactor: number;
    rotation: number;
    position: number;
    flips: { v: boolean; h: boolean; };
    brightness: number;
    fps?: {
        intervalId: number;
        framerate: number;
    };
    files: {
        original: HTMLImageElement[];
        scaled: HTMLImageElement[];
        currentFileIndex: number;
    };
    src: string;
    layer: number;
    loadingState: 'not-loaded' | 'loading' | 'loaded';
}

export enum MetaDataKeys {
    LOADING_PROGRESS
}