"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";

import { getApiErrorMessage } from "@/lib/errors";
import {
  convertGpaScale,
  type GpaScaleConversionResponse,
} from "@/lib/api";

const COMMON_SCALES = [4, 9, 10, 12];

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function clampCurrentGpa(value: number, scale: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, scale));
}

function normalizePositiveScaleInput(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function ScaleSelectorCard({
  title,
  selectedScale,
  onPresetSelect,
  onCustomScaleChange,
}: {
  title: string;
  selectedScale: number;
  onPresetSelect: (scale: number) => void;
  onCustomScaleChange: (scale: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#E8E3DC] bg-[#F8F5F0] p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B6560]">
        {title}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {COMMON_SCALES.map((scale) => (
          <button
            key={`${title}-${scale}`}
            type="button"
            onClick={() => onPresetSelect(scale)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              selectedScale === scale
                ? "bg-[#5F7A8A] text-white"
                : "bg-white text-[#6B6560] hover:bg-[#E8EFF5]"
            }`}
          >
            {scale.toFixed(1)}
          </button>
        ))}
      </div>
      <label className="block text-[11px] text-[#6B6560]">
        {title === "Current Scale" ? "Custom source scale" : "Custom target scale"}
      </label>
      <input
        type="number"
        min="0.1"
        step="0.1"
        value={selectedScale}
        onChange={(event) => {
          onCustomScaleChange(
            normalizePositiveScaleInput(Number(event.target.value))
          );
        }}
        className="mt-2 w-full rounded-xl border border-[#D4CFC7] bg-white px-3 py-2 text-sm text-[#3A3530] outline-none transition focus:border-[#5F7A8A]"
      />
    </div>
  );
}

export function GpaScaleConverter() {
  const [fromScale, setFromScale] = useState(9);
  const [toScale, setToScale] = useState(4);
  const [currentGpa, setCurrentGpa] = useState(8.2);
  const [result, setResult] = useState<GpaScaleConversionResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setCurrentGpa((previous) => clampCurrentGpa(previous, fromScale));
  }, [fromScale]);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      if (fromScale <= 0 || toScale <= 0) {
        setResult(null);
        setError("Scales must be greater than 0.");
        return;
      }

      setIsLoading(true);
      try {
        const conversion = await convertGpaScale({
          current_gpa: currentGpa,
          from_scale: fromScale,
          to_scale: toScale,
        });
        setResult(conversion);
        setError("");
      } catch (e) {
        setResult(null);
        setError(getApiErrorMessage(e, "Failed to convert GPA scale."));
      } finally {
        setIsLoading(false);
      }
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [currentGpa, fromScale, toScale]);

  const sliderStep = fromScale <= 5 ? 0.05 : 0.1;

  return (
    <div className="rounded-3xl border border-[#D4CFC7] bg-[#FFFFFF] p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ArrowRightLeft size={18} className="text-[#5F7A8A]" />
            <h3 className="font-bold text-[#3A3530]">GPA Scale Converter</h3>
          </div>
          <p className="max-w-2xl text-xs leading-5 text-[#6B6560]">
            Convert an existing GPA between point scales such as 4.0, 9.0, 10.0,
            or a custom scale. This uses normalized scale conversion, so it is
            helpful for comparison but should not be treated as an official
            institutional equivalency rule.
          </p>
        </div>
        <span className="rounded-full bg-[#E8EFF5] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5F7A8A]">
          Slider Tool
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <ScaleSelectorCard
              title="Current Scale"
              selectedScale={fromScale}
              onPresetSelect={setFromScale}
              onCustomScaleChange={setFromScale}
            />

            <ScaleSelectorCard
              title="Target Scale"
              selectedScale={toScale}
              onPresetSelect={setToScale}
              onCustomScaleChange={setToScale}
            />
          </div>

          <div className="rounded-2xl border border-[#E8E3DC] bg-[#F8F5F0] p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B6560]">
                  Current GPA
                </p>
                <p className="mt-1 text-sm text-[#6B6560]">
                  Slide from 0 to {formatNumber(fromScale, 1)} on your current scale.
                </p>
              </div>
              <input
                type="number"
                min="0"
                max={formatNumber(fromScale, 4)}
                step={sliderStep}
                value={currentGpa}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setCurrentGpa(
                    clampCurrentGpa(
                      Number.isFinite(nextValue) ? nextValue : 0,
                      fromScale
                    )
                  );
                }}
                className="w-24 rounded-xl border border-[#D4CFC7] bg-white px-3 py-2 text-right text-sm text-[#3A3530] outline-none transition focus:border-[#5F7A8A]"
              />
            </div>

            <input
              type="range"
              min="0"
              max={fromScale}
              step={sliderStep}
              value={currentGpa}
              onChange={(event) => {
                setCurrentGpa(Number(event.target.value));
              }}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#D9E5ED]"
            />

            <div className="mt-2 flex justify-between text-[11px] text-[#8B847C]">
              <span>0.0</span>
              <span>{formatNumber(fromScale, 1)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#C4D6E4] bg-[#E8EFF5] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5F7A8A]">
            Converted Result
          </p>

          <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-[#6B6560]">
              {formatNumber(currentGpa, 2)} on a {formatNumber(fromScale, 1)} scale
            </p>
            <div className="mt-2 text-4xl font-bold text-[#3A3530]">
              {result ? formatNumber(result.converted_gpa, 4) : "--"}
            </div>
            <p className="mt-1 text-sm text-[#6B6560]">
              on a {formatNumber(toScale, 1)} scale
            </p>
            <span className="mt-3 inline-block rounded-full bg-[#E8F2EA] px-3 py-1 text-xs font-bold text-[#6B9B7A]">
              {result
                ? `${formatNumber(result.normalized_percent, 2)}% of source scale`
                : "Waiting for valid values"}
            </span>
          </div>

          {isLoading ? (
            <p className="mt-3 text-xs text-[#6B6560]">Updating conversion...</p>
          ) : null}
          {error ? (
            <p className="mt-3 text-xs text-[#B86B6B]">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
