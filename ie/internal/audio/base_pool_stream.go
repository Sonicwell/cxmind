package audio

// BasePoolStream provides shared Results/Errors/Close delegation for all pool-based ASR streams.
// Each provider embeds this and only needs to implement SendAudio().
type BasePoolStream struct {
	handler *GenericTaskHandler
}

// Results returns the transcription results channel
func (b *BasePoolStream) Results() <-chan TranscriptionResult {
	return b.handler.Results()
}

// Errors returns the error channel
func (b *BasePoolStream) Errors() <-chan error {
	return b.handler.Errors()
}

// Close closes the underlying task handler
func (b *BasePoolStream) Close() error {
	return b.handler.Close()
}
