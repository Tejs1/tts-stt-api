"use client";

import React, { useEffect, useState, useRef } from "react";
import * as io from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Ban, Volume2 } from "lucide-react";

const sampleRate = 16000;

const getMediaStream = () =>
  navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: "default",
      sampleRate: sampleRate,
      sampleSize: 16,
      channelCount: 1,
    },
    video: false,
  });

interface WordRecognized {
  isFinal: boolean;
  text: string;
}

const AudioToText: React.FC = () => {
  const [connection, setConnection] = useState<io.Socket>();
  const [currentRecognition, setCurrentRecognition] = useState<string>();
  const [recognitionHistory, setRecognitionHistory] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const processorRef = useRef<AudioWorkletNode>();
  const audioContextRef = useRef<AudioContext>();
  const audioInputRef = useRef<MediaStreamAudioSourceNode>();

  const speechRecognized = (data: WordRecognized) => {
    if (data.isFinal) {
      setCurrentRecognition("...");
      setRecognitionHistory((old) => [data.text, ...old]);
    } else setCurrentRecognition(data.text + "...");
  };

  useEffect(() => {
    console.log("\n\nrecognitionHistory", recognitionHistory);
  }, [recognitionHistory]);

  const connect = () => {
    if (connection) {
      connection.disconnect();
    }
    const socket = io.connect("http://localhost:8081");
    socket.on("connect", () => {
      console.log("connected", socket.id);
      setConnection(socket);
      socket.emit("startGoogleCloudStream");
    });
    socket.emit("send_message", "hello world");

    socket.on("receive_message", (data) => {
      console.log("received message", data);
    });

    socket.on("receive_audio_text", (data) => {
      speechRecognized(data);
      console.log("received audio text", data);
    });

    socket.on("disconnect", () => {
      console.log("disconnected", socket.id);
    });
  };

  const disconnect = () => {
    if (!connection) return;
    connection?.emit("endGoogleCloudStream");
    connection?.disconnect();
    processorRef.current?.disconnect();
    audioInputRef.current?.disconnect();
    void audioContextRef.current?.close();
    setConnection(undefined);
    setRecorder(null);
    setIsRecording(false);
  };

  useEffect(() => {
    (async () => {
      if (connection) {
        if (isRecording) {
          return;
        }

        const stream = await getMediaStream();

        audioContextRef.current = new window.AudioContext();

        await audioContextRef.current.audioWorklet.addModule(
          "/src/worklets/recorderWorkletProcessor.js",
        );

        audioContextRef.current.resume();

        audioInputRef.current =
          audioContextRef.current.createMediaStreamSource(stream);

        processorRef.current = new AudioWorkletNode(
          audioContextRef.current,
          "recorder.worklet",
        );

        processorRef.current.connect(audioContextRef.current.destination);
        await audioContextRef.current.resume();

        audioInputRef.current.connect(processorRef.current);

        processorRef.current.port.onmessage = (event: any) => {
          const audioData = event.data;
          connection.emit("send_audio_data", { audio: audioData });
        };
        setIsRecording(true);
      } else {
        console.error("No connection");
      }
    })();
    return () => {
      if (isRecording) {
        processorRef.current?.disconnect();
        audioInputRef.current?.disconnect();
        if (audioContextRef.current?.state !== "closed") {
          audioContextRef.current?.close();
        }
      }
    };
  }, [connection, isRecording, recorder]);

  return (
    <>
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="mb-8 text-3xl font-bold">Audio To Text</h1>
          <div className="space-x-4">
            <Button
              variant={isRecording ? "destructive" : "default"}
              onClick={connect}
              disabled={isRecording}
            >
              <Mic className="mr-2 h-4 w-4" />
              Start
            </Button>
            <Button
              variant="secondary"
              onClick={disconnect}
              disabled={!isRecording}
            >
              <Ban className="mr-2 h-4 w-4" />
              Stop
            </Button>
          </div>
        </div>
        <div className="mt-8">
          <h2 className="mb-4 text-center text-2xl font-semibold">
            Recognition History
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Transcriptions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recognitionHistory.map((tx, idx) => (
                  <li key={idx} className="flex items-center">
                    <Volume2 className="mr-2 h-4 w-4" />
                    {tx}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <h4 className="font-semibold">Current Recognition</h4>
                <p>{currentRecognition}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default AudioToText;
