package runner

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/MiguelFazioAssuncao/runspect.v1/internal/domain"
)

type CppRunner struct {
	HeaderPath         string
	CompileTimeout     time.Duration
	RunTimeout         time.Duration
	MaxEvents          int
	MaxLineBytes       int
	MaxStderrBytes     int
	MemoryBytes        uint64
	StackBytes         uint64
	CompileMemoryBytes uint64
	Sandbox            bool
}

func NewCppRunner(headerPath string) *CppRunner {
	return &CppRunner{
		HeaderPath:         headerPath,
		CompileTimeout:     10 * time.Second,
		RunTimeout:         3 * time.Second,
		MaxEvents:          100000,
		MaxLineBytes:       8 << 20,
		MaxStderrBytes:     64 << 10,
		MemoryBytes:        512 << 20,
		StackBytes:         256 << 20,
		CompileMemoryBytes: 2 << 30,
		Sandbox:            true,
	}
}

type limitedBuffer struct {
	buf bytes.Buffer
	max int
}

func (l *limitedBuffer) Write(p []byte) (int, error) {
	remaining := l.max - l.buf.Len()
	if remaining > 0 {
		if len(p) > remaining {
			l.buf.Write(p[:remaining])
		} else {
			l.buf.Write(p)
		}
	}
	return len(p), nil
}

func (l *limitedBuffer) String() string {
	return l.buf.String()
}

func fail(message string) domain.ExecutionResult {
	return domain.ExecutionResult{Success: false, Errors: message}
}

func (r *CppRunner) checkTools() string {
	if _, err := exec.LookPath("g++"); err != nil {
		return "Compilador g++ não encontrado"
	}
	if !r.Sandbox {
		return ""
	}
	for _, tool := range []string{"bwrap", "prlimit"} {
		if _, err := exec.LookPath(tool); err != nil {
			return "Sandbox indisponível: instale bubblewrap e util-linux, ou defina RUNSPECT_SANDBOX=off apenas em desenvolvimento"
		}
	}
	return ""
}

func (r *CppRunner) baseDir(dir string) string {
	if r.Sandbox {
		return "/work"
	}
	return dir
}

func (r *CppRunner) compileLimits() []string {
	return []string{
		"--cpu=" + strconv.Itoa(int(r.CompileTimeout.Seconds())+2),
		"--as=" + strconv.FormatUint(r.CompileMemoryBytes, 10),
		"--fsize=" + strconv.FormatInt(64<<20, 10),
		"--nofile=256",
		"--core=0",
	}
}

func (r *CppRunner) runLimits() []string {
	return []string{
		"--cpu=" + strconv.Itoa(int(r.RunTimeout.Seconds())+1),
		"--as=" + strconv.FormatUint(r.MemoryBytes, 10),
		"--stack=" + strconv.FormatUint(r.StackBytes, 10),
		"--fsize=0",
		"--nofile=16",
		"--nproc=1",
		"--core=0",
	}
}

func (r *CppRunner) wrap(dir string, compile bool, limits, argv []string) []string {
	if !r.Sandbox {
		if _, err := exec.LookPath("prlimit"); err != nil {
			return argv
		}
		out := make([]string, 0, len(limits)+len(argv)+1)
		out = append(out, "prlimit")
		out = append(out, limits...)
		return append(out, argv...)
	}

	args := []string{
		"bwrap",
		"--unshare-all",
		"--die-with-parent",
		"--clearenv",
		"--ro-bind", "/usr", "/usr",
		"--ro-bind-try", "/lib", "/lib",
		"--ro-bind-try", "/lib64", "/lib64",
		"--ro-bind-try", "/bin", "/bin",
		"--ro-bind-try", "/etc/ld.so.cache", "/etc/ld.so.cache",
		"--proc", "/proc",
		"--dev", "/dev",
	}
	if compile {
		args = append(args,
			"--tmpfs", "/tmp",
			"--bind", dir, "/work",
			"--setenv", "TMPDIR", "/tmp",
			"--setenv", "HOME", "/tmp",
		)
	} else {
		args = append(args, "--ro-bind", dir, "/work")
	}
	args = append(args,
		"--chdir", "/work",
		"--setenv", "PATH", "/usr/bin:/bin",
		"--setenv", "LANG", "C",
		"prlimit",
	)
	args = append(args, limits...)
	return append(args, argv...)
}

func (r *CppRunner) command(ctx context.Context, dir string, argv []string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Dir = dir
	cmd.Env = []string{"PATH=/usr/bin:/bin"}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	cmd.WaitDelay = time.Second
	return cmd
}

func (r *CppRunner) compile(dir string) string {
	ctx, cancel := context.WithTimeout(context.Background(), r.CompileTimeout)
	defer cancel()

	base := r.baseDir(dir)
	argv := r.wrap(dir, true, r.compileLimits(), []string{
		"g++", "-O2", "-pipe", "-std=c++17",
		"-I", base,
		base + "/solution.cpp",
		"-o", base + "/solution",
	})

	out := &limitedBuffer{max: r.MaxStderrBytes}
	cmd := r.command(ctx, dir, argv)
	cmd.Stdout = out
	cmd.Stderr = out

	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return "Tempo de compilação excedido"
	}
	if err != nil {
		return fmt.Sprintf("Erro de Compilação:\n%s", out.String())
	}
	return ""
}

func describeExit(err error, stderr string) string {
	reason := err.Error()
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		code := exitErr.ExitCode()
		if status, ok := exitErr.Sys().(syscall.WaitStatus); ok && status.Signaled() {
			code = 128 + int(status.Signal())
		}
		switch code {
		case 134:
			reason = "abortado (assert, exceção não tratada ou memória insuficiente)"
		case 136:
			reason = "exceção aritmética (divisão por zero)"
		case 137:
			reason = "encerrado (limite de memória ou CPU)"
		case 139:
			reason = "falha de segmentação (acesso inválido ou recursão profunda)"
		case 152:
			reason = "limite de tempo de CPU excedido"
		default:
			reason = fmt.Sprintf("código de saída %d", code)
		}
	}
	message := strings.TrimSpace(stderr)
	if message == "" {
		return fmt.Sprintf("Erro em tempo de execução: %s", reason)
	}
	return fmt.Sprintf("Erro em tempo de execução: %s\n%s", reason, message)
}

func (r *CppRunner) execute(dir, stdin string, start time.Time) domain.ExecutionResult {
	ctx, cancel := context.WithTimeout(context.Background(), r.RunTimeout)
	defer cancel()

	base := r.baseDir(dir)
	argv := r.wrap(dir, false, r.runLimits(), []string{base + "/solution"})

	cmd := r.command(ctx, dir, argv)
	cmd.Stdin = strings.NewReader(stdin)
	stderr := &limitedBuffer{max: r.MaxStderrBytes}
	cmd.Stderr = stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fail("Erro ao capturar saída")
	}
	if err := cmd.Start(); err != nil {
		return fail("Erro ao executar binário")
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), r.MaxLineBytes)

	steps := make([]domain.TraceStep, 0, 256)
	limitHit := false

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 || line[0] != '{' {
			continue
		}

		var values map[string]any
		if err := json.Unmarshal(line, &values); err != nil {
			continue
		}
		event, _ := values["step_event"].(string)
		if event == "" {
			continue
		}
		delete(values, "step_event")

		if len(steps) >= r.MaxEvents {
			limitHit = true
			break
		}
		steps = append(steps, domain.TraceStep{
			Step:      len(steps) + 1,
			StepEvent: event,
			Data:      values,
		})
	}

	scanErr := scanner.Err()
	if limitHit || scanErr != nil {
		cancel()
		_ = cmd.Wait()
		if limitHit {
			return domain.ExecutionResult{
				Success: false,
				Steps:   steps,
				Errors:  fmt.Sprintf("Limite de %d eventos excedido", r.MaxEvents),
			}
		}
		if errors.Is(scanErr, bufio.ErrTooLong) {
			return domain.ExecutionResult{
				Success: false,
				Steps:   steps,
				Errors:  fmt.Sprintf("Uma linha de saída excedeu o limite de %d MiB", r.MaxLineBytes>>20),
			}
		}
		return domain.ExecutionResult{Success: false, Steps: steps, Errors: "Falha ao ler a saída do programa"}
	}

	waitErr := cmd.Wait()
	if ctx.Err() == context.DeadlineExceeded {
		return domain.ExecutionResult{Success: false, Steps: steps, Errors: "Time Limit Exceeded (TLE)"}
	}
	if waitErr != nil {
		return domain.ExecutionResult{
			Success: false,
			Steps:   steps,
			Errors:  describeExit(waitErr, stderr.String()),
		}
	}

	return domain.ExecutionResult{
		Success: true,
		Steps:   steps,
		TimeMs:  time.Since(start).Milliseconds(),
	}
}

func (r *CppRunner) Run(code, stdin string) domain.ExecutionResult {
	start := time.Now()

	if message := r.checkTools(); message != "" {
		return fail(message)
	}

	tmpDir, err := os.MkdirTemp("", "runspect-cpp-*")
	if err != nil {
		return fail("Falha ao criar diretório temporário")
	}
	defer os.RemoveAll(tmpDir)

	headerContent, err := os.ReadFile(r.HeaderPath)
	if err != nil {
		return fail("Header visualizer.h não encontrado")
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "visualizer.h"), headerContent, 0644); err != nil {
		return fail("Falha ao preparar o header visualizer.h")
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "solution.cpp"), []byte(code), 0644); err != nil {
		return fail("Falha ao salvar código C++")
	}

	if message := r.compile(tmpDir); message != "" {
		return fail(message)
	}

	return r.execute(tmpDir, stdin, start)
}