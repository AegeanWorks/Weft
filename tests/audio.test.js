import test from "node:test";
import assert from "node:assert/strict";

import { createAudio } from "../src/ui/audio.js";

function stubScope(state = "running") {
  const calls = [];
  class FakeContext {
    constructor() {
      this.state = state;
      this.currentTime = 10;
      this.destination = {};
      calls.push(["construct"]);
    }

    resume() {
      this.state = "running";
      calls.push(["resume"]);
      return Promise.resolve();
    }

    createOscillator() {
      return {
        type: null,
        frequency: {
          setValueAtTime(value, at) {
            calls.push(["freq", value, at]);
          },
        },
        connect() {},
        start(at) {
          calls.push(["start", at]);
        },
        stop(at) {
          calls.push(["stop", at]);
        },
      };
    }

    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  }
  return { scope: { AudioContext: FakeContext }, calls };
}

function frequencies(calls) {
  return calls.filter(([kind]) => kind === "freq").map(([, value]) => value);
}

test("sound starts unmuted and plays nothing without an audio context", () => {
  const audio = createAudio({});
  assert.equal(audio.isMuted(), false);
  assert.equal(audio.play("tick"), false);
  assert.equal(audio.unlock(), false);
});

test("an unknown cue never touches the context", () => {
  const { scope, calls } = stubScope();
  const audio = createAudio(scope);
  assert.equal(audio.play("nope"), false);
  assert.deepEqual(calls, []);
});

test("muting silences every cue without constructing a context", () => {
  const { scope, calls } = stubScope();
  const audio = createAudio(scope);
  audio.setMuted(true);
  assert.equal(audio.isMuted(), true);
  assert.equal(audio.play("win"), false);
  assert.deepEqual(calls, []);
  audio.setMuted(false);
  assert.equal(audio.isMuted(), false);
});

test("the tick cue schedules one 660Hz sine tone", () => {
  const { scope, calls } = stubScope();
  const audio = createAudio(scope);
  assert.equal(audio.play("tick"), true);
  assert.ok(calls.some(([kind, value]) => kind === "freq" && value === 660));
  assert.equal(calls.filter(([kind]) => kind === "start").length, 1);
  assert.equal(calls.filter(([kind]) => kind === "stop").length, 1);
});

test("the hint cue schedules two rising triangle tones", () => {
  const { scope, calls } = stubScope();
  const audio = createAudio(scope);
  assert.equal(audio.play("hint"), true);
  assert.deepEqual(frequencies(calls), [880, 1174.66]);
});

test("the undo cue schedules a descending pair", () => {
  const { scope, calls } = stubScope();
  const audio = createAudio(scope);
  assert.equal(audio.play("undo"), true);
  assert.deepEqual(frequencies(calls), [392, 293.66]);
});

test("the reset cue schedules one low tone", () => {
  const { scope, calls } = stubScope();
  const audio = createAudio(scope);
  assert.equal(audio.play("reset"), true);
  assert.deepEqual(frequencies(calls), [196]);
  assert.equal(calls.filter(([kind]) => kind === "start").length, 1);
});

test("the action cues stay distinct from the shared tick", () => {
  const first = {};
  for (const name of ["tick", "connect", "hint", "undo", "reset", "error", "win"]) {
    const { scope, calls } = stubScope();
    createAudio(scope).play(name);
    first[name] = frequencies(calls)[0];
  }
  assert.equal(first.tick, 660);
  assert.equal(
    new Set([first.tick, first.hint, first.undo, first.reset]).size,
    4,
  );
  assert.notEqual(first.hint, first.tick);
  assert.notEqual(first.undo, first.tick);
  assert.notEqual(first.reset, first.tick);
});

test("the win cue schedules four ascending tones", () => {
  const { scope, calls } = stubScope();
  const audio = createAudio(scope);
  assert.equal(audio.play("win"), true);
  assert.deepEqual(
    calls.filter(([kind]) => kind === "freq").map(([, value]) => value),
    [523.25, 659.25, 783.99, 1046.5],
  );
});

test("unlock resumes a suspended context", async () => {
  const { scope, calls } = stubScope("suspended");
  const audio = createAudio(scope);
  assert.equal(audio.unlock(), true);
  assert.ok(calls.includes("resume") || calls.some(([kind]) => kind === "resume"));
});
