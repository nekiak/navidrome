import ReactJkMusicPlayer from 'navidrome-music-player'
import { useCallback, useEffect, useRef, useState } from 'react'
import config, { shareInfo } from '../config'
import { shareCoverUrl, shareDownloadUrl, shareStreamUrl } from '../utils'

import { makeStyles } from '@material-ui/core/styles'
import VolumeUp from '@material-ui/icons/VolumeUp'
import VolumeOff from '@material-ui/icons/VolumeOff'

// How long the download button stays inert after a click. The browser needs a
// moment to show its own download UI; until then the page looks unresponsive.
export const DOWNLOAD_FEEDBACK_MS = 5000

const useStyle = makeStyles({
  player: {
    '& .group .next-audio': {
      pointerEvents: (props) => props.single && 'none',
      opacity: (props) => props.single && 0.65,
    },
    '& .group.audio-download': {
      pointerEvents: (props) => props.downloading && 'none',
      opacity: (props) => props.downloading && 0.65,
    },
    '& .volume-control': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '1.5 !important',
      padding: '0 8px',
    },
    '& .volume-icon': {
      display: 'inline-flex',
      alignItems: 'center',
      cursor: 'pointer',
      marginRight: 6,
      color: 'hsla(0,0%,100%,.6)',
      '& svg': {
        fontSize: '22px',
      },
      '&:hover svg': {
        color: '#31c27c',
      },
    },
    '& .volume-slider': {
      width: '100%',
      maxWidth: 100,
      height: 4,
      accentColor: '#31c27c',
      cursor: 'pointer',
    },
    '@media (min-width: 768px)': {
      '& .react-jinke-music-player-mobile > div': {
        width: 768,
        margin: 'auto',
      },
      '& .react-jinke-music-player-mobile-cover': {
        width: 'auto !important',
      },
    },
  },
})

export const SHARE_VOLUME_KEY = 'share-volume'

const getStoredVolume = () => {
  try {
    const saved = localStorage.getItem(SHARE_VOLUME_KEY)
    if (saved !== null) {
      const parsed = parseFloat(saved)
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed
      }
    }
  } catch (e) {
    // localStorage might not be available or throw in certain browser contexts
  }
  return 1
}

const saveStoredVolume = (vol) => {
  try {
    localStorage.setItem(SHARE_VOLUME_KEY, String(vol))
  } catch (e) {
    // ignore write errors
  }
}

const SharePlayer = () => {
  const [downloading, setDownloading] = useState(false)
  const [volume, setVolume] = useState(getStoredVolume)
  const audioRef = useRef(null)
  const prevVolumeRef = useRef(volume > 0 ? volume : 1)
  const timer = useRef(null)
  const classes = useStyle({
    single: shareInfo?.tracks.length === 1,
    downloading,
  })

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
    saveStoredVolume(newVolume)
  }, [])

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      prevVolumeRef.current = volume
      setVolume(0)
      if (audioRef.current) {
        audioRef.current.volume = 0
      }
      saveStoredVolume(0)
    } else {
      const restored = prevVolumeRef.current || 1
      setVolume(restored)
      if (audioRef.current) {
        audioRef.current.volume = restored
      }
      saveStoredVolume(restored)
    }
  }, [volume])

  const list = shareInfo?.tracks.map((s) => {
    return {
      name: s.title,
      musicSrc: shareStreamUrl(s.id),
      cover: shareCoverUrl(s.id, true),
      singer: s.artist,
      duration: s.duration,
    }
  })
  // An anchor, not a navigation: the service worker's NavigationRoute would
  // intercept the streamed archive and fail it.
  const customDownloader = useCallback(() => {
    const link = document.createElement('a')
    link.href = shareDownloadUrl(shareInfo?.id)
    link.download = ''
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    setDownloading(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () => setDownloading(false),
      DOWNLOAD_FEEDBACK_MS,
    )
  }, [])
  const options = {
    audioLists: list,
    defaultVolume: volume,
    mode: 'full',
    toggleMode: false,
    mobileMediaQuery: '',
    showDownload: shareInfo?.downloadable && config.enableDownloads,
    showReload: false,
    showMediaSession: true,
    theme: 'auto',
    showThemeSwitch: false,
    restartCurrentOnPrev: true,
    remove: false,
    spaceBar: true,
    volumeFade: { fadeIn: 200, fadeOut: 200 },
    sortableOptions: { delay: 200, delayOnTouchOnly: true },
    extendsContent: (
      <li className="item volume-control" key="volume-control">
        <span
          className="volume-icon"
          onClick={toggleMute}
          title={volume === 0 ? 'Unmute' : 'Mute'}
        >
          {volume === 0 ? <VolumeOff /> : <VolumeUp />}
        </span>
        <input
          type="range"
          className="volume-slider"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          aria-label="Volume"
        />
      </li>
    ),
  }
  return (
    <ReactJkMusicPlayer
      {...options}
      className={classes.player}
      customDownloader={customDownloader}
      getAudioInstance={(instance) => {
        audioRef.current = instance
        if (instance) {
          instance.volume = volume
        }
      }}
    />
  )
}

export default SharePlayer
