# DownloadCEF.cmake - Download CEF binary distribution if not available

if(CEF_ROOT)
    message(STATUS "Using existing CEF at: ${CEF_ROOT}")
    return()
endif()

set(CEF_DISTRIBUTION_VERSION "131.2.1+g5607e7c+chromium-131.0.6778.69")

if(APPLE)
    if(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
        set(CEF_PLATFORM "macosarm64")
    else()
        set(CEF_PLATFORM "macosx64")
    endif()
    set(CEF_ARCHIVE_EXT ".tar.bz2")
elseif(WIN32)
    set(CEF_PLATFORM "windows64")
    set(CEF_ARCHIVE_EXT ".zip")
else()
    set(CEF_PLATFORM "linux64")
    set(CEF_ARCHIVE_EXT ".tar.bz2")
endif()

set(CEF_DOWNLOAD_URL "https://cef-builds.spotifycdn.com/cef_binary_${CEF_DISTRIBUTION_VERSION}_${CEF_PLATFORM}${CEF_ARCHIVE_EXT}")
set(CEF_DOWNLOAD_DIR "${CMAKE_BINARY_DIR}/cef_download")
set(CEF_EXTRACT_DIR "${CMAKE_BINARY_DIR}/cef")
set(CEF_ROOT "${CEF_EXTRACT_DIR}" CACHE PATH "CEF root directory" FORCE)

if(NOT EXISTS "${CEF_EXTRACT_DIR}/cmake/cef_variables.cmake")
    message(STATUS "Downloading CEF ${CEF_DISTRIBUTION_VERSION} for ${CEF_PLATFORM}...")
    file(MAKE_DIRECTORY ${CEF_DOWNLOAD_DIR})

    if(NOT EXISTS "${CEF_DOWNLOAD_DIR}/cef_binary_${CEF_DISTRIBUTION_VERSION}_${CEF_PLATFORM}${CEF_ARCHIVE_EXT}")
        file(DOWNLOAD
            ${CEF_DOWNLOAD_URL}
            "${CEF_DOWNLOAD_DIR}/cef_binary_${CEF_DISTRIBUTION_VERSION}_${CEF_PLATFORM}${CEF_ARCHIVE_EXT}"
            SHOW_PROGRESS
            STATUS DOWNLOAD_STATUS
        )
        list(GET DOWNLOAD_STATUS 0 STATUS_CODE)
        if(NOT STATUS_CODE EQUAL 0)
            message(FATAL_ERROR "Failed to download CEF: ${DOWNLOAD_STATUS}")
        endif()
    endif()

    message(STATUS "Extracting CEF...")
    file(ARCHIVE_EXTRACT
        INPUT "${CEF_DOWNLOAD_DIR}/cef_binary_${CEF_DISTRIBUTION_VERSION}_${CEF_PLATFORM}${CEF_ARCHIVE_EXT}"
        DESTINATION ${CEF_DOWNLOAD_DIR}/extracted
    )

    file(GLOB CEF_EXTRACTED_DIR "${CEF_DOWNLOAD_DIR}/extracted/cef_binary_*")
    list(GET CEF_EXTRACTED_DIR 0 FIRST_EXTRACTED)
    file(RENAME ${FIRST_EXTRACTED} ${CEF_EXTRACT_DIR})

    message(STATUS "CEF extracted to: ${CEF_EXTRACT_DIR}")
else()
    message(STATUS "Using cached CEF at: ${CEF_EXTRACT_DIR}")
endif()
