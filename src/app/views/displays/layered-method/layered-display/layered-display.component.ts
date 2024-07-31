import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { debounceTime, fromEvent, Observable, Subject } from 'rxjs';
import { LayeredDisplaySettingsBrokerService } from 'src/app/services/layered-display/layered-display-settings-broker.service';
import { LayeredDisplayFileSettings, LayeredDisplayGeneralSettings, LayeredDisplaySettings, MetaDataKeys } from 'src/app/services/layered-display/layered-display-settings.type';

@Component({
  selector: 'app-layered-display',
  standalone: true,
  templateUrl: './layered-display.component.html',
  styleUrls: ['./layered-display.component.scss']
})
export class LayeredDisplayComponent implements AfterViewInit {
  @Input() resizeEvent$ = fromEvent(window, 'resize');

  private readonly requestDraw$ = new Subject<void>();
  private readonly MY_SETTINGS_BROKER_ID = "LayeredDisplayComponent";

  private lastSettings?: LayeredDisplaySettings;

  @ViewChild('displayCanvas') displayCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('container') container!: ElementRef<HTMLDivElement>;

  constructor(private settingsBroker: LayeredDisplaySettingsBrokerService) {
    settingsBroker.settings$.subscribe(({settings, changedBy}) => {
      if(changedBy == this.MY_SETTINGS_BROKER_ID) {
        this.lastSettings = settings;
        return;
      }

      this.recalculateValues(settings.generalSettings);
      this.updateImageSettings(settings);

      this.lastSettings = settings;

      this.requestDraw$.next();
    });

    this.requestDraw$.subscribe(() => this.draw());
    this.resizeEvent$.pipe(debounceTime(100)).subscribe(() => this.onCanvasResize());
  }

  ngAfterViewInit(): void {
    this.recalculateValues(this.settingsBroker.getSettings().generalSettings);
    this.onCanvasResize();

    // TODO: Start the tutorial
  }

  onCanvasResize(): void {
    this.recalculateValues(this.settingsBroker.getSettings().generalSettings);

    this.displayCanvas.nativeElement.width = window.innerWidth;
    this.displayCanvas.nativeElement.height = window.innerHeight;
    this.displayCanvas.nativeElement.style.width = `${window.innerWidth}px`;
    this.displayCanvas.nativeElement.style.height = `${window.innerHeight}px`;

    this.requestDraw$.next();
  }

  private recalculateValues(generalSettings: LayeredDisplayGeneralSettings): void {

  }

  private updateImageSettings(settings: LayeredDisplaySettings): void {
    settings.fileSettings.forEach((file) => {
      // check if the file needs to be loaded/configured
      if(!this.lastSettings?.fileSettings.find((f) => f.unique_id == file.unique_id)) { // the file needs to be loaded
        if(file.fps) window.clearInterval(file.fps.intervalId);

        // the file is a gif
        if(file.mimeType == 'image/gif') {
          // prepare a request to load the gif
          let xhr = new XMLHttpRequest();
          xhr.open('GET', file.src, true);
          xhr.responseType = 'arraybuffer';

          xhr.onload = () => {
            let arrayBuffer = xhr.response;
            
            if(arrayBuffer) {
              // parse the gif and load the frames
              let gif = parseGIF(arrayBuffer);
              let gifFrames = decompressFrames(gif, true);

              let gifImages: HTMLImageElement[] = [];
              let gifImagesLoaded = 0;

              // wait until all images are loaded by checking the number of loaded images every 100ms
              const interval = window.setInterval(() => {
                if(gifImagesLoaded == gifFrames.length) {
                  window.clearInterval(interval);
    
                  file.files.original = gifImages;
                  file.files.currentFileIndex = 0;
                  this.scaleImagesFromFileSetting([file]).then(() => {
                    const updatedSettings = this.settingsBroker.getSettings();
                    const updatedFileIndex = updatedSettings.fileSettings.findIndex((f) => f.unique_id == file.unique_id);
    
                    if(updatedFileIndex == -1) return;

                    if(file.fps)
                      window.clearInterval(file.fps.intervalId);
      
                    const framerate = file.fps?.framerate || 10;

                    file.fps = {
                      framerate,
                      intervalId: window.setInterval(() => {
                        const updatedSettings = this.settingsBroker.getSettings();
      
                        if(updatedSettings.fileSettings.findIndex((f) => f.unique_id == file.unique_id) == -1) return;
      
                        const upToDateFile = updatedSettings.fileSettings.find((f) => f.unique_id == file.unique_id)!;
      
                        upToDateFile.files.currentFileIndex = (upToDateFile.files.currentFileIndex + 1) % upToDateFile.files.original.length;
  
                        this.requestDraw$.next();
                      }, 1000/framerate)
                    }
    
                    updatedSettings.fileSettings[updatedFileIndex] = file;
                    this.settingsBroker.updateSettings(updatedSettings, this.MY_SETTINGS_BROKER_ID);
                    this.requestDraw$.next();
                  });
                }
              })

              // load the images
              gifFrames.forEach((frame) => {
                let imageData = new ImageData(frame.patch, frame.dims.width, frame.dims.height);
                let canvas = document.createElement('canvas');
                canvas.width = frame.dims.width;
                canvas.height = frame.dims.height;
                let ctx = canvas.getContext('2d');
                ctx?.putImageData(imageData, 0, 0);

                let image = new Image();
                image.src = canvas.toDataURL();
                image.width = canvas.width;
                image.height = canvas.height;

                gifImages.push(image);

                image.onload = () => {
                  gifImagesLoaded++;
                }
              });
            }

            else {
              const settings = this.settingsBroker.getSettings();
              const latestFileIndex = settings.fileSettings.findIndex((f) => f.unique_id == file.unique_id);

              settings.fileSettings.splice(latestFileIndex, 1);
              alert('Failed to load gif');
              this.settingsBroker.updateSettings(settings, this.MY_SETTINGS_BROKER_ID);
              return;
            }
          }

          xhr.onerror = () => {
            const settings = this.settingsBroker.getSettings();
            const latestFileIndex = settings.fileSettings.findIndex((f) => f.unique_id == file.unique_id);

            settings.fileSettings.splice(latestFileIndex, 1);
            alert('Failed to load gif');
            this.settingsBroker.updateSettings(settings, this.MY_SETTINGS_BROKER_ID);
            return;
          }

          xhr.send();
        }

        // the file is a static image
        else if(file.mimeType.startsWith('image')) {
          const originalImage = new Image();
          originalImage.src = file.src;

          file.files.original = [originalImage];
          file.files.currentFileIndex = 0;

          originalImage.onload = () => this.scaleImagesFromFileSetting([file]).then(() => {
              const updatedSettings = this.settingsBroker.getSettings();
              const updatedFileIndex = updatedSettings.fileSettings.findIndex((f) => f.unique_id == file.unique_id);

              if(updatedFileIndex == -1) {
                console.error('Failed to find the file in the settings');
                return;
              }

              updatedSettings.fileSettings[updatedFileIndex] = file;
              this.settingsBroker.updateSettings(updatedSettings, this.MY_SETTINGS_BROKER_ID);
              this.requestDraw$.next();
            });
        }

        // the file is a video
        else if(file.mimeType.startsWith('video')) {
          // clear the interval id if it exists
          if(file.fps)
            window.clearInterval(file.fps.intervalId);

          // init a video element to load the video
          let video = document.createElement('video');
          video.src = file.src;
          
          video.onloadeddata = () => {
            // load the video and extract the frames to handle it as a gif
            const videoFrames = require('video-frames');

            videoFrames({
              url: video.src,
              count: video.duration * 30, // extract 30 frames per second
              width: 720,
              onProgress: (framesExtracted: number, totalFrames: number) => {
                const updatedSettings = this.settingsBroker.getSettings();

                if(updatedSettings.fileSettings.findIndex((f) => f.unique_id == file.unique_id) == -1)
                  return;

                updatedSettings.fileSettings.find((f) => f.unique_id == file.unique_id)!.metaData[MetaDataKeys.LOADING_PROGRESS] = $localize`${framesExtracted} of ${totalFrames} frames`;
                console.log(`Extracted ${framesExtracted} of ${totalFrames} frames`);
              }
            }).then((frames: { offset: number, image: string }[]) => {
              const updatedSettings = this.settingsBroker.getSettings();
              const updatedFile = updatedSettings.fileSettings.find((f) => f.unique_id == file.unique_id);

              if(!updatedFile) return;

              updatedFile.metaData[MetaDataKeys.LOADING_PROGRESS] = $localize`Finalizing...`;
              this.settingsBroker.updateSettings(updatedSettings, this.MY_SETTINGS_BROKER_ID);

              let videoImages: HTMLImageElement[] = [];
              let videoImagesLoaded = 0;

              // wait until all images are loaded by checking the number of loaded images every 100ms
              const interval = window.setInterval(() => {
                if(videoImagesLoaded == frames.length) {
                  window.clearInterval(interval);
              
                  if(updatedFile.fps)
                    window.clearInterval(updatedFile.fps.intervalId);

                  delete file.metaData[MetaDataKeys.LOADING_PROGRESS];
                  file.files.original = videoImages;
                  file.files.currentFileIndex = 0;
    
                  if(file.fps)
                    window.clearInterval(file.fps.intervalId);

                  const framerate = file.fps?.framerate || 30;
    
                  this.scaleImagesFromFileSetting([file]).then(() => {
                    file.fps = {
                      framerate,
                      intervalId: window.setInterval(() => {
                        const updatedSettings = this.settingsBroker.getSettings();
      
                        if(updatedSettings.fileSettings.findIndex((f) => f.unique_id == file.unique_id) == -1) return;
      
                        const upToDateFile = updatedSettings.fileSettings.find((f) => f.unique_id == file.unique_id)!;
                        upToDateFile.files.currentFileIndex = (upToDateFile.files.currentFileIndex + 1) % upToDateFile.files.original.length;
      
                        this.requestDraw$.next();
                      }, 1000/framerate)
                    };
    
                    const updatedSettings = this.settingsBroker.getSettings();
                    const i = updatedSettings.fileSettings.findIndex((f) => f.unique_id == file.unique_id);

                    if(i == -1) return;

                    updatedSettings.fileSettings[i] = file;
      
                    this.settingsBroker.updateSettings(updatedSettings, this.MY_SETTINGS_BROKER_ID);
                    this.requestDraw$.next();
                  });
                }
              }, 100);

              // load the images
              frames.forEach((frame) => {
                let image = new Image();
                image.src = frame.image;

                videoImages.push(image);

                image.onload = () => {
                  videoImagesLoaded++;
                }
              });
            });
          }
        }
      }
    });

    // remove all files that are not in the latest settings anymore
    this.lastSettings?.fileSettings.forEach((file) => {
      if(!settings.fileSettings.some((f) => f.unique_id == file.unique_id)) {
        if(file.fps)
          window.clearInterval(file.fps.intervalId);
      }
    });

    this.requestDraw$.next();
  }

  private scaleImagesFromFileSetting(fileSettings: LayeredDisplayFileSettings[]) {
    let settingsFinished = 0;

    fileSettings.forEach((fileSetting) => {
      const scalingFactor = fileSetting.scalingFactor;
      const originalFiles = fileSetting.files.original;

      if((fileSetting.mimeType === 'image/gif' || fileSetting.mimeType.startsWith('video')) && originalFiles.length > 0) {
        const newlyScaledFiles: HTMLImageElement[] = [];
        let loadedImages = 0;

        originalFiles.forEach((image) => {
          const scaled = document.createElement('img');
          scaled.src = image.src;
          scaled.width = image.width * scalingFactor/100;
          scaled.height = image.height * scalingFactor/100;

          scaled.onload = () => {
            newlyScaledFiles.push(scaled);
            loadedImages++;
          }

          scaled.onerror = () => {
            console.error('Failed to load gif frame');
            loadedImages++;
          }

        });

        // wait until all images are loaded
        const intervalId = window.setInterval(() => {
          if(loadedImages == originalFiles.length) {
            window.clearInterval(intervalId);
            fileSetting.files.scaled = newlyScaledFiles;
            settingsFinished++;
          }
        }, 100);
      }

      else if(fileSetting.mimeType.startsWith('image') && originalFiles.length > 0) {
        const scaled = document.createElement('img');
        scaled.src = originalFiles[0].src;
        scaled.width = originalFiles[0].width * scalingFactor/100;
        scaled.height = originalFiles[0].height * scalingFactor/100;


        scaled.onload = () => {
          fileSetting.files.scaled = [scaled];
          settingsFinished++;
        }

        scaled.onerror = () => {
          console.error('Failed to load image');
          settingsFinished++;
        }
      }
    });

    return new Promise<void>((resolve) => {
      const intervalId = window.setInterval(() => {
        if(settingsFinished == fileSettings.length) {
          clearInterval(intervalId);
          resolve();
        }
      }, 100);
    });
  }

  private draw(): void {
    const canvas = this.displayCanvas.nativeElement;
    const ctx = this.displayCanvas.nativeElement.getContext('2d')!;
    const settings = this.settingsBroker.getSettings();
    const layerSize = canvas.width / settings.generalSettings.numberOfLayers;

    ctx.save();
    canvas.width = canvas.width; // Clear the canvas

    // draw the images
    for(let i = 0; i < settings.generalSettings.numberOfLayers; i++) {
      const layerFile = settings.fileSettings.find((f) => f.layer === i);

      if(!layerFile) {
        console.error(`No file for layer ${i}; Skipping...`);
        continue;
      }

      // draw the image in the center of the layer
      const image = layerFile.files.scaled[layerFile.files.currentFileIndex];

      if(!image) {
        console.error(`No image for file at layer ${i}; Skipping...`);
        continue;
      }

      ctx.resetTransform();
      ctx.restore();
      ctx.save();

      ctx.translate(i * layerSize, 0);

      ctx.beginPath();
      ctx.rect(0, 0, layerSize, canvas.height);
      ctx.clip();

      ctx.rotate(Math.PI / 2);

      ctx.drawImage(
        image,
        canvas.height/2 - (image.width/2 * (layerFile.scalingFactor/100)),
        -layerSize/2 - (image.height/2 * (layerFile.scalingFactor/100)),
        image.width * (layerFile.scalingFactor/100),
        image.height * (layerFile.scalingFactor/100)
      );
    }

    // draw the lines between the layers
    ctx.resetTransform();
    ctx.restore();
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 1;

    for(let i = 0; i < settings.generalSettings.numberOfLayers - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(layerSize * (i+1), 0);
      ctx.lineTo(layerSize * (i+1), canvas.height);
      ctx.stroke();
    }
  }
}
