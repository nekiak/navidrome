import { render, act, fireEvent } from '@testing-library/react'
import SharePlayer, {
  DOWNLOAD_FEEDBACK_MS,
  SHARE_VOLUME_KEY,
} from './SharePlayer'

let playerProps
let renderCount

vi.mock('navidrome-music-player', () => ({
  default: (props) => {
    playerProps = props
    renderCount++
    return <div data-testid="player">{props.extendsContent}</div>
  },
}))

vi.mock('../config', () => ({
  default: { enableDownloads: true },
  shareInfo: {
    id: 'share-1',
    downloadable: true,
    tracks: [{ id: 't1', title: 'One', artist: 'A', duration: 100 }],
  },
}))

vi.mock('../utils', () => ({
  shareDownloadUrl: (id) => `/share/d/${id}`,
  shareStreamUrl: (id) => `/share/s/${id}`,
  shareCoverUrl: (id) => `/share/img/${id}`,
}))

describe('SharePlayer', () => {
  let clickSpy

  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    playerProps = null
    renderCount = 0
    // Downloading for real would navigate the jsdom window.
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    localStorage.clear()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('downloads via an anchor so the service worker does not intercept it', () => {
    render(<SharePlayer />)

    let anchor
    clickSpy.mockImplementation(function () {
      anchor = { href: this.href, download: this.download }
    })

    act(() => {
      playerProps.customDownloader()
    })

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(anchor.href).toContain('/share/d/share-1')
    // Empty, so the server's Content-Disposition filename wins.
    expect(anchor.download).toBe('')
  })

  it('removes the anchor from the document after clicking', () => {
    render(<SharePlayer />)

    act(() => {
      playerProps.customDownloader()
    })

    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })

  // The inert styling itself is driven by JSS function values, which jsdom does
  // not evaluate; it is verified in a browser. What is checked here is the
  // state machine feeding it -- that the component re-renders on download and
  // again when the window closes.
  it('re-renders when the feedback window opens and closes', () => {
    render(<SharePlayer />)

    const beforeDownload = renderCount
    act(() => {
      playerProps.customDownloader()
    })
    expect(renderCount).toBeGreaterThan(beforeDownload)

    const beforeExpiry = renderCount
    act(() => {
      vi.runAllTimers()
    })
    expect(renderCount).toBeGreaterThan(beforeExpiry)
  })

  it('restarts the feedback window on a repeat download', () => {
    render(<SharePlayer />)

    act(() => {
      playerProps.customDownloader()
    })
    const elapsedBeforeRepeat = Math.floor(DOWNLOAD_FEEDBACK_MS / 2)
    act(() => {
      vi.advanceTimersByTime(elapsedBeforeRepeat)
    })
    act(() => {
      playerProps.customDownloader()
    })

    // Past the first timer's deadline, which it would have fired at had the
    // repeat download not replaced it.
    const beforeOriginalDeadline = renderCount
    act(() => {
      vi.advanceTimersByTime(DOWNLOAD_FEEDBACK_MS - elapsedBeforeRepeat + 1)
    })
    expect(renderCount).toBe(beforeOriginalDeadline)

    act(() => {
      vi.runAllTimers()
    })
    expect(renderCount).toBeGreaterThan(beforeOriginalDeadline)
  })

  it('does not update state after unmount', () => {
    const { unmount } = render(<SharePlayer />)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    act(() => {
      playerProps.customDownloader()
    })
    unmount()
    act(() => {
      vi.runAllTimers()
    })

    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('updates audio element volume and localStorage when volume slider changes and supports mute toggle', () => {
    const { getByRole, getByTitle } = render(<SharePlayer />)
    const mockAudio = { volume: 1 }

    act(() => {
      playerProps.getAudioInstance(mockAudio)
    })

    const slider = getByRole('slider', { name: /volume/i })
    expect(slider).toBeInTheDocument()
    expect(slider.value).toBe('1')

    // Change volume via slider
    act(() => {
      fireEvent.change(slider, { target: { value: '0.5' } })
    })

    expect(mockAudio.volume).toBe(0.5)
    expect(localStorage.getItem(SHARE_VOLUME_KEY)).toBe('0.5')

    // Click mute icon
    const muteIcon = getByTitle('Mute')
    act(() => {
      fireEvent.click(muteIcon)
    })

    expect(mockAudio.volume).toBe(0)
    expect(localStorage.getItem(SHARE_VOLUME_KEY)).toBe('0')

    // Click unmute icon to restore
    const unmuteIcon = getByTitle('Unmute')
    act(() => {
      fireEvent.click(unmuteIcon)
    })

    expect(mockAudio.volume).toBe(0.5)
    expect(localStorage.getItem(SHARE_VOLUME_KEY)).toBe('0.5')
  })

  it('restores previous volume from localStorage on initial render and applies to audio instance', () => {
    localStorage.setItem(SHARE_VOLUME_KEY, '0.35')

    const { getByRole } = render(<SharePlayer />)
    const mockAudio = { volume: 1 }

    act(() => {
      playerProps.getAudioInstance(mockAudio)
    })

    const slider = getByRole('slider', { name: /volume/i })
    expect(slider.value).toBe('0.35')
    expect(mockAudio.volume).toBe(0.35)
    expect(playerProps.defaultVolume).toBe(0.35)
  })

  it('falls back to default volume (1.0) when localStorage has invalid data', () => {
    localStorage.setItem(SHARE_VOLUME_KEY, 'invalid-num')

    const { getByRole } = render(<SharePlayer />)
    const mockAudio = { volume: 0.5 }

    act(() => {
      playerProps.getAudioInstance(mockAudio)
    })

    const slider = getByRole('slider', { name: /volume/i })
    expect(slider.value).toBe('1')
    expect(mockAudio.volume).toBe(1)
  })
})
