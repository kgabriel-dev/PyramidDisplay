import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  BroadcastTarget,
  SettingsBroadcastingService,
} from 'src/app/services/settings-broadcasting.service';
import { Subject } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-standard-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './standard-settings.component.html',
  styleUrls: ['./standard-settings.component.scss'],
})
export class SettingsComponent {
  innerPolygonSize = new FormControl(Number(environment.defaultValueInnerPolygonSize));
  imageSizes: FormControl[] = [];
  imagePositions: FormControl[] = [];
  sideCount = new FormControl(Number(environment.defaultValueSideCount));
  imageSwapTime = new FormControl(Number(environment.defaultValueSwapTime));

  currentSettingsFile: File | undefined;
  currentImages: { name: string; src: string }[] = [];
  imagesChanged$ = new Subject<string[]>();

  readonly controlsAndTargets: {
    control: FormControl;
    target: BroadcastTarget;
  }[] = [
    { control: this.innerPolygonSize, target: 'InnerPolygonSize' },
    { control: this.sideCount, target: 'SideCount' },
  ];

  constructor(
    private settingsBroadcaster: SettingsBroadcastingService,
    public router: Router
  ) {
    settingsBroadcaster.silentChangeOfSwapTime(this.imageSwapTime.value);
    this.imageSwapTime.valueChanges.subscribe((newValue) => {
      this.settingsBroadcaster.silentChangeOfSwapTime(newValue);
    });

    this.imagesChanged$.subscribe((imgList) => {
      this.settingsBroadcaster.broadcastChange('NewImages', imgList);

      if(imgList.length > this.imageSizes.length)
        for(let i = 0; i < imgList.length; i++) {
          this.imageSizes.push(new FormControl(100));
          this.imagePositions.push(new FormControl(0));
        }

        this.settingsBroadcaster.broadcastChange('ImageSizes', this.imageSizes.map((control) => control.value));
        this.settingsBroadcaster.broadcastChange('ImagePositions', this.imagePositions.map((control) => control.value));
    });

    this.controlsAndTargets.forEach((pair) => {
      pair.control.valueChanges.subscribe((newValue) => {
        this.settingsBroadcaster.broadcastChange(pair.target, newValue);
      });
    });
  }

  saveSettings(): void {
    // build the settings string
    const currSettings: SettingsData = {
      innerPolygonSize: this.innerPolygonSize.value || 50,
      imagePositions: this.imagePositions.map((control) => control.value),
      imageSizes: this.imageSizes.map((control) => control.value),
      sideCount: this.sideCount.value || 4,
      imageSwapTime: this.imageSwapTime.value || 1000,
    };

    const dlink: HTMLAnchorElement = document.createElement('a');
    dlink.download = 'pyramid-display-settings.json'; // the file name
    const myFileContent: string = JSON.stringify(currSettings, undefined, 2);
    dlink.href = 'data:text/plain;charset=utf-16,' + myFileContent;
    dlink.click(); // this will trigger the dialog window
    dlink.remove();
  }

  loadSettings(event: Event): void {
    const element = event.currentTarget as HTMLInputElement,
      fileList = element.files;

    if (fileList) {
      this.currentSettingsFile = fileList[0];

      // read in settings
      const fileReader = new FileReader();
      fileReader.onload = () => {
        const loadedSettings = JSON.parse(fileReader.result?.toString() || '');

        this.innerPolygonSize.setValue(loadedSettings.innerPolygonSize || 50);
        this.imageSizes = (loadedSettings.imageSizes || '[]').map((size: number) => new FormControl(size));
        this.imagePositions = (loadedSettings.imagePositions || '[]').map((pos: number) => new FormControl(pos));
        this.sideCount.setValue(loadedSettings.sideCount || 4);
        this.imageSwapTime.setValue(loadedSettings.imageSwapTime || 1000);
      };
      fileReader.readAsText(this.currentSettingsFile);
    }
  }

  addImages(event: Event) {
    const element = event.currentTarget as HTMLInputElement,
      fileList = element.files;

    if (fileList) {
      const fileReader = new FileReader();
      let readingIndex = 0;

      fileReader.onload = (e) => {
        this.currentImages.push({
          src: e.target?.result?.toString() || 'FEHLER - ERROR',
          name: fileList[readingIndex].name,
        });

        if (++readingIndex < fileList.length)
          fileReader.readAsDataURL(fileList[readingIndex]);
        else
          this.imagesChanged$.next(
            this.currentImages.map((imagePair) => imagePair.src)
          );
      };

      fileReader.readAsDataURL(fileList[readingIndex]);
    }
  }

  pushImageUp(index: number) {
    if (index <= 0) return;

    // swap images, positions and sizes
    [this.currentImages[index - 1], this.currentImages[index]] = [this.currentImages[index], this.currentImages[index - 1]];
    [this.imagePositions[index - 1], this.imagePositions[index]] = [this.imagePositions[index], this.imagePositions[index - 1]];
    [this.imageSizes[index - 1], this.imageSizes[index]] = [this.imageSizes[index], this.imageSizes[index - 1]];

    this.imagesChanged$.next(
      this.currentImages.map((imagePair) => imagePair.src)
    );
  }

  pushImageDown(index: number) {
    if (index >= this.currentImages.length - 1) return;

    // swap images, positions and sizes
    [this.currentImages[index + 1], this.currentImages[index]] = [this.currentImages[index], this.currentImages[index + 1]];
    [this.imagePositions[index + 1], this.imagePositions[index]] = [this.imagePositions[index], this.imagePositions[index + 1]];
    [this.imageSizes[index + 1], this.imageSizes[index]] = [this.imageSizes[index], this.imageSizes[index + 1]];

    this.imagesChanged$.next(
      this.currentImages.map((imagePair) => imagePair.src)
    );
  }

  scaleImage(index: number, type: 'plus' | 'minus') {
    if (type === 'plus') this.imageSizes[index].setValue(this.imageSizes[index].value + 10);
    else if (type === 'minus') this.imageSizes[index].setValue(this.imageSizes[index].value - 10);

    this.settingsBroadcaster.broadcastChange('ImageSizes', this.imageSizes.map((control) => control.value));
  }

  moveImage(index: number, type: 'up' | 'down') {
    if (type === 'up') this.imagePositions[index].setValue(this.imagePositions[index].value + 10);
    else if (type === 'down') this.imagePositions[index].setValue(this.imagePositions[index].value - 10);

    this.settingsBroadcaster.broadcastChange('ImagePositions', this.imagePositions.map((control) => control.value));
  }
}

export type SettingsData = {
  innerPolygonSize: number;
  imageSizes: number[];
  imagePositions: number[];
  sideCount: number;
  imageSwapTime: number;
};
