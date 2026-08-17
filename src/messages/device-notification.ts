import { BaseMessage } from "./base-message";

export class DeviceNotificationMessage extends BaseMessage {
    public static readonly Id = 0x3c;

    public payloadSize: number | undefined;
    public devices: any[] = [];

    public deserialize(data: Uint8Array) {
        const view = new DataView(data.buffer);

        this.payloadSize = view.getUint16(1, true);

        let offset = 3;

        while (offset < 3 + this.payloadSize!) {
            const type = view.getUint8(offset);

            switch (type) {
                case 0x00:
                    offset = this.parseBattery(view, offset);
                    break;

                case 0x01:
                    offset = this.parseImu(view, offset);
                    break;

                case 0x02:
                    offset = this.parseMatrix(view, offset);
                    break;

                case 0x0a:
                    offset = this.parseMotor(view, offset);
                    break;

                case 0x0b:
                    offset = this.parseForceSensor(view, offset);
                    break;

                case 0x0c:
                    offset = this.parseColorSensor(view, offset);
                    break;

                case 0x0d:
                    offset = this.parseDistanceSensor(view, offset);
                    break;

                case 0x0e:
                    offset = this.parse3x3Matrix(view, offset);
                    break;
                default:
                    return;
            }
        }
    }

    private parseBattery(view: DataView, offset: number): number {
        const level = view.getUint8(offset + 1);

        this.devices.push({
            type: "battery",
            level,
        });

        return offset + 2;
    }

    private parseImu(view: DataView, offset: number): number {
        const hubFaceUp = view.getUint8(offset + 1);
        const yawFace = view.getUint8(offset + 2);
        const yaw = view.getInt16(offset + 3, true);
        const pitch = view.getInt16(offset + 5, true);
        const roll = view.getInt16(offset + 7, true);

        const accX = view.getInt16(offset + 9, true);
        const accY = view.getInt16(offset + 11, true);
        const accZ = view.getInt16(offset + 13, true);

        const gyroX = view.getInt16(offset + 15, true);
        const gyroY = view.getInt16(offset + 17, true);
        const gyroZ = view.getInt16(offset + 19, true);

        this.devices.push({
            type: "imu",
            hubFaceUp,
            yawFace,
            yaw,
            pitch,
            roll,
            accX,
            accY,
            accZ,
            gyroX,
            gyroY,
            gyroZ,
        });

        return offset + 21;
    }

    private parseMatrix(view: DataView, offset: number): number {
        const pixels: number[] = [];

        for (let i = 0; i < 25; i++) {
            pixels.push(view.getUint8(offset + 1 + i));
        }

        this.devices.push({
            type: "matrix5x5",
            pixels,
        });

        return offset + 26;
    }

    private parseMotor(view: DataView, offset: number): number {
        const port = view.getUint8(offset + 1);
        const deviceType = view.getUint8(offset + 2);
        const absPosition = view.getInt16(offset + 3, true);
        const power = view.getInt16(offset + 5, true);
        const speed = view.getInt8(offset + 7);
        const position = view.getInt32(offset + 8, true);

        this.devices.push({
            type: "motor",
            port,
            deviceType,
            absPosition,
            power,
            speed,
            position,
        });

        return offset + 12;
    }

    private parseForceSensor(view: DataView, offset: number): number {
        const port = view.getUint8(offset + 1);
        const value = view.getUint8(offset + 2);
        const pressed = view.getUint8(offset + 3) === 0x01;

        this.devices.push({
            type: "force",
            port,
            value,
            pressed,
        });

        return offset + 4;
    }

    private parseColorSensor(view: DataView, offset: number): number {
        const port = view.getUint8(offset + 1);
        const color = view.getInt8(offset + 2);
        const red = view.getUint16(offset + 3, true);
        const green = view.getUint16(offset + 5, true);
        const blue = view.getUint16(offset + 7, true);

        this.devices.push({
            type: "color",
            port,
            color,
            red,
            green,
            blue,
        });

        return offset + 9;
    }

    private parseDistanceSensor(view: DataView, offset: number): number {
        const port = view.getUint8(offset + 1);
        const distance = view.getInt16(offset + 2, true);

        this.devices.push({
            type: "distance",
            port,
            distance,
        });

        return offset + 4;
    }

    private parse3x3Matrix(view: DataView, offset: number): number {
        const port = view.getUint8(offset + 1);
        const pixels: number[] = [];

        for (let i = 0; i < 9; i++) {
            pixels.push(view.getUint8(offset + 2 + i));
        }

        this.devices.push({
            type: "matrix3x3",
            port,
            pixels,
        });

        return offset + 11;
    }
}
