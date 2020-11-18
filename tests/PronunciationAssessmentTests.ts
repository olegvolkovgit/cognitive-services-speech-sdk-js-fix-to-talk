// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as sdk from "../microsoft.cognitiveservices.speech.sdk";
import {
    PronunciationAssessmentGradingSystem,
    PronunciationAssessmentGranularity
} from "../microsoft.cognitiveservices.speech.sdk";
import {
    ConsoleLoggingListener,
    WebsocketMessageAdapter
} from "../src/common.browser/Exports";
import {
    Events,
    EventType
} from "../src/common/Exports";
import { Settings } from "./Settings";
import { closeAsyncObjects } from "./Utilities";
import { WaveFileAudioInput } from "./WaveFileAudioInputStream";

let objsToClose: any[];

beforeAll(() => {
    // override inputs, if necessary
    Settings.LoadSettings();
    Events.instance.attachListener(new ConsoleLoggingListener(EventType.Debug));
});

beforeEach(() => {
    objsToClose = [];
    // tslint:disable-next-line:no-console
    console.info("------------------Starting test case: " + expect.getState().currentTestName + "-------------------------");
    // tslint:disable-next-line:no-console
    console.info("Start Time: " + new Date(Date.now()).toLocaleString());
});

afterEach(async (done: jest.DoneCallback) => {
    // tslint:disable-next-line:no-console
    console.info("End Time: " + new Date(Date.now()).toLocaleString());
    await closeAsyncObjects(objsToClose);
    done();
});

const BuildRecognizerFromWaveFile: (speechConfig?: sdk.SpeechConfig, audioFileName?: string) => sdk.SpeechRecognizer = (speechConfig?: sdk.SpeechConfig, audioFileName?: string): sdk.SpeechRecognizer => {

    let s: sdk.SpeechConfig = speechConfig;
    if (s === undefined) {
        s = BuildSpeechConfig();
        // Since we're not going to return it, mark it for closure.
        objsToClose.push(s);
    }

    const fileName: string = undefined === audioFileName ? Settings.LuisWaveFile : audioFileName;
    const f: File = WaveFileAudioInput.LoadFile(fileName);
    const config: sdk.AudioConfig = sdk.AudioConfig.fromWavFileInput(f);

    const language: string = Settings.WaveFileLanguage;
    if (s.speechRecognitionLanguage === undefined) {
        s.speechRecognitionLanguage = language;
    }

    const r: sdk.SpeechRecognizer = new sdk.SpeechRecognizer(s, config);
    expect(r).not.toBeUndefined();

    return r;
};

const BuildSpeechConfig: () => sdk.SpeechConfig = (): sdk.SpeechConfig => {

    let s: sdk.SpeechConfig;
    if (undefined === Settings.SpeechEndpoint) {
        s = sdk.SpeechConfig.fromSubscription(Settings.SpeechSubscriptionKey, Settings.SpeechRegion);
    } else {
        s = sdk.SpeechConfig.fromEndpoint(new URL(Settings.SpeechEndpoint), Settings.SpeechSubscriptionKey);
    }

    if (undefined !== Settings.proxyServer) {
        s.setProxy(Settings.proxyServer, Settings.proxyPort);
    }

    expect(s).not.toBeUndefined();
    return s;
};

test("testPronunciationAssessmentConfig::normal", (done: jest.DoneCallback) => {
    // tslint:disable-next-line:no-console
    console.info("Name: testPronunciationAssessmentConfig:::normal");
    let pronConfig: sdk.PronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig("reference");
    let j = JSON.parse(pronConfig.toJSON());
    expect(j.referenceText === "reference");
    expect(j.gradingSystem === "FivePoint");
    expect(j.granularity === "Phoneme");
    expect(j.dimension === "Comprehensive");
    expect(j.scenarioId).toBeUndefined();

    pronConfig = new sdk.PronunciationAssessmentConfig("reference",
        PronunciationAssessmentGradingSystem.HundredMark,
        PronunciationAssessmentGranularity.Word, true);
    pronConfig.referenceText = "new reference";
    j = JSON.parse(pronConfig.toJSON());
    expect(j.referenceText === "new reference");
    expect(j.gradingSystem === "HundredMark");
    expect(j.granularity === "Word");
    expect(j.dimension === "Comprehensive");
    expect(j.enableMiscue === true);
    done();
});

test("testPronunciationAssessmentConfig::fromJson", (done: jest.DoneCallback) => {
    // tslint:disable-next-line:no-console
    console.info("Name: testPronunciationAssessmentConfig::fromJson");
    const jsonString = `{"dimension": "Comprehensive", "enableMiscue": false, "key": "value"}`;
    const pronConfig = sdk.PronunciationAssessmentConfig.fromJSON(jsonString);
    expect(JSON.parse(pronConfig.toJSON()) === JSON.parse(jsonString));
    done();
});

describe.each([true, false])("Service based tests", (forceNodeWebSocket: boolean) => {

    beforeAll(() => {
        WebsocketMessageAdapter.forceNpmWebSocket = forceNodeWebSocket;
    });

    afterAll(() => {
        WebsocketMessageAdapter.forceNpmWebSocket = false;
    });

    test("test Pronunciation Assessment", (done: jest.DoneCallback) => {
        // tslint:disable-next-line:no-console
        console.info("Name: test Pronunciation Assessment");
        const s: sdk.SpeechConfig = BuildSpeechConfig();
        objsToClose.push(s);

        const r: sdk.SpeechRecognizer = BuildRecognizerFromWaveFile(s, Settings.WaveFile);
        objsToClose.push(r);

        const p: sdk.PronunciationAssessmentConfig = new sdk.PronunciationAssessmentConfig("");
        objsToClose.push(p);
        p.applyTo(r);

        r.canceled = (o: sdk.Recognizer, e: sdk.SpeechRecognitionCanceledEventArgs): void => {
            try {
                expect(e.errorDetails).toBeUndefined();
            } catch (error) {
                done.fail(error);
            }
        };

        r.recognizeOnceAsync((result: sdk.SpeechRecognitionResult) => {
            try {
                expect(result).not.toBeUndefined();
                expect(result.errorDetails).toBeUndefined();
                expect(result.text).toEqual(Settings.WaveFileText);
                expect(result.properties).not.toBeUndefined();
                expect(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)).not.toBeUndefined();
                const pronResult = sdk.PronunciationAssessmentResult.fromResult(result);
                expect(pronResult).not.toBeUndefined();
                expect(pronResult.detailResult).not.toBeUndefined();
                expect(pronResult.detailResult.Words[0].Word).not.toBeUndefined();
                expect(pronResult.pronunciationScore).toBeGreaterThan(0);
                expect(pronResult.accuracyScore).toBeGreaterThan(0);
                expect(pronResult.fluencyScore).toBeGreaterThan(0);
                expect(pronResult.completenessScore).toBeGreaterThan(0);
                done();
            } catch (error) {
                done.fail(error);
            }
        }, (error: string) => {
            done.fail(error);
        });
    });
});