
import csv
import time
import serial
from pathlib import Path

PORT = "COM4"  # Change this to your ESP32 port
BAUD = 115200

output_file = Path("gesture_dataset.csv")

if not output_file.exists():
    with output_file.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "timestamp", "gesture",
            "thumb", "index", "middle", "ring"
        ])

try:
    with serial.Serial(PORT, BAUD, timeout=1) as esp:
        time.sleep(2)
        esp.reset_input_buffer()

        while True:
            gesture = input(
                "\nEnter gesture name (or QUIT): "
            ).strip().upper()

            if gesture == "QUIT":
                break

            try:
                duration = float(
                    input("Recording duration in seconds: ")
                )
            except ValueError:
                print("Enter a valid number.")
                continue

            count = 0
            end_time = time.time() + duration

            with output_file.open("a", newline="") as f:
                writer = csv.writer(f)

                while time.time() < end_time:
                    line = esp.readline().decode(
                        "utf-8", errors="ignore"
                    ).strip()

                    try:
                        values = [int(x) for x in line.split(",")]
                    except ValueError:
                        continue

                    if len(values) != 4:
                        continue

                    writer.writerow([
                        round(time.time(), 3),
                        gesture,
                        *values
                    ])
                    count += 1

            print(f"Saved {count} readings for {gesture}.")

except serial.SerialException as e:
    print("Serial error:", e)
    print("Check the COM port and close Serial Monitor.")

print("Dataset location:", output_file.resolve())
